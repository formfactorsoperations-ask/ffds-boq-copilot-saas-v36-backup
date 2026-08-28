import React, { useMemo, useState, useEffect } from 'react';
import LockedState from './LockedState';
import { 
    FullProjectData, 
    ProjectContext,
    ProjectUpdateRecord, 
    PaymentMilestone, 
    Item, 
    SiteUpdateRecord, 
    ProjectDecisionRecord,
    MaterialSelection,
    DesignDocument,
    SignoffRecord,
    DigitalSignatureDocket
} from '../types';
import { calculateSellPrice, formatINR } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePaymentRequests, usePaymentOverdueCheck } from '../hooks/usePaymentRequests';
import { db, functions } from '../services/firebaseClient';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { 
    calculateClientLifecycleStages, 
    calculateClientActionItems, 
    getUpcomingStudioSteps, 
    ClientActionItem,
    AgreementStatus
} from '../services/clientPortalEngine';
import { buildSignoffPatch, buildDisputePatch, resolveApprovals, AgreementKind } from '../services/clientApprovalEngine';
import DocumentReadingRoom from './client/DocumentReadingRoom';
import ClientDocumentVault from './client/ClientDocumentVault';
import { ClientMoMViewerModal } from './client/ClientMoMViewerModal';
import {
    getCurrentIssue,
    recordDocumentView,
    resolveDocumentState,
    agreementKindFor,
    signIssue
} from '../services/documentIssueEngine';
import { raiseQuery, getOpenQueries } from '../services/documentQueryEngine';
import { ClientDocumentKind } from '../types';
import DigitalSignatureDocketView from './common/DigitalSignatureDocket';
import { 
    LayoutDashboard, 
    CalendarDays, 
    Wallet, 
    ClipboardList, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    ChevronRight,
    ChevronDown,
    FileText,
    ArrowRight,
    Building2,
    IndianRupee,
    Check,
    XCircle,
    Link as LinkIcon,
    LogOut,
    Sparkles,
    ExternalLink,
    PhoneCall,
    Mail,
    Activity,
    GitMerge,
    Image as ImageIcon,
    Camera,
    PlusCircle,
    MinusCircle,
    FileEdit,
    Folder,
    Map as MapIcon,
    BookOpen,
    Info,
    HelpCircle,
    ShieldCheck,
    Printer,
    CheckSquare,
    Copy,
    Search,
    Maximize2,
    Eye,
    ThumbsUp,
    MessageSquare,
    Send,
    Building,
    Phone,
    MapPin,
    CreditCard,
    Lock,
    X,
    Filter,
    Download,
    Share2,
    Layers,
    SlidersHorizontal,
    MessageCircle,
    CheckCircle,
    ArrowUpRight,
    FolderOpen,
    Users,
    Calendar,
    Sparkle,
    FileCheck,
    Edit3,
    Paperclip
} from 'lucide-react';
import { useStudioSettings } from '../hooks/useStudioSettings';
import ScheduleGantt from './ScheduleGantt';
import { buildScheduleFromProject } from '../lib/scheduleBuilder';
import { db as storageDb } from '../services/dbService';
import { ProjectSchedule } from '../types';

/** How an offline signature was actually captured, in the client's words. */
const MEDIUM_LABEL: Record<string, string> = {
    paper_wet_ink: 'on paper',
    email_confirmation: 'by email confirmation',
    whatsapp_approval: 'by WhatsApp confirmation',
    in_person_verbal: 'verbally, in person'
};

interface ClientPortalProps {
    projectData: FullProjectData;
    bank: Item[];
    onLogout?: () => void;
    onProjectUpdate?: (project: FullProjectData) => void;
}

export default function ClientPortal({ projectData, bank, onLogout, onProjectUpdate }: ClientPortalProps) {
    const isInternalStudioView = !onLogout;
    const isD1Paid = projectData?.context?.paymentMilestones?.some(m => (m.id === 'd1' || (m as any).phase === 'signup') && m.status === 'paid');

    const { orgData } = useOrg();
    const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const studioCompanyName = settings?.companyName || orgData?.orgName || 'Form Factors Design Studio';
    const primaryThemeColor = settings?.primaryColor || orgData?.themeColor || '#0f172a';
    const { context: propContext, tiers, timeline = [] } = projectData;
    const [localContext, setLocalContext] = useState<ProjectContext>(propContext);

    useEffect(() => {
        if (projectData.context) {
            setLocalContext(projectData.context);
        }
    }, [projectData.context]);

    const context = localContext || propContext;
    const updates = context.projectUpdates || [];
    const decisions = context.projectDecisions || [];
    const siteUpdates = context.siteUpdates || [];
    const materialSelections = context.materialSelections || [];
    const designDocuments = context.designDocuments || [];
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    
    const { steps: stepProgressSteps } = useStepProgress(projectData.id, studioId);
    usePaymentOverdueCheck(projectData.id, studioId);
    
    // Active Tab State
    const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'documents' | 'roadmap' | 'feed' | 'designs' | 'decisions' | 'materials' | 'scope' | 'financials'>('overview');
    
    // In-Portal Digital Signing & Approvals State
    // The Reading Room replaces the old signing modal, which showed hardcoded
    // bullets rather than the document the studio actually issued.
    const [readingRoomKind, setReadingRoomKind] = useState<ClientDocumentKind | null>(null);

    // A specific issue can be targeted — that is how an addendum is opened,
    // since it lives alongside the signed document rather than replacing it.
    const [readingRoomIssueId, setReadingRoomIssueId] = useState<string | undefined>(undefined);

    /** Opens a document for reading, and stamps that the client saw it. */
    const openDocument = (kind: ClientDocumentKind, issueId?: string) => {
        setReadingRoomKind(kind);
        setReadingRoomIssueId(issueId);
        setProjectContext(recordDocumentView(kind));
    };

    /** Maps the agreement vocabulary used across the portal to a document kind. */
    const DOC_KIND_FOR_AGREEMENT: Record<string, ClientDocumentKind> = {
        terms: 'terms_docket',
        contract: 'execution_agreement',
        handover: 'handover_docket'
    };
    const setSigningDocType = (t: 'terms' | 'contract' | 'handover' | null) => {
        if (!t) { setReadingRoomKind(null); return; }
        openDocument(DOC_KIND_FOR_AGREEMENT[t]);
    };
    const [signSuccessMessage, setSignSuccessMessage] = useState<string | null>(null);
    const [approvalsFilter, setApprovalsFilter] = useState<'all' | 'agreements' | 'payments' | 'materials' | 'decisions' | 'variations'>('all');
    
    // Filters & Search State
    const [feedCategoryFilter, setFeedCategoryFilter] = useState<'all' | 'site' | 'meetings' | 'variations' | 'payments' | 'decisions'>('all');
    const [feedSearchQuery, setFeedSearchQuery] = useState('');
    const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
    const [boqSearchQuery, setBoqSearchQuery] = useState<string>('');
    const [boqRoomFilter, setBoqRoomFilter] = useState<string>('all');
    const [boqTradeFilter, setBoqTradeFilter] = useState<string>('all');
    const [boqViewMode, setBoqViewMode] = useState<'table' | 'focus'>('table');
    const [focusedBoqItem, setFocusedBoqItem] = useState<any | null>(null);
    const [designTypeFilter, setDesignTypeFilter] = useState<string>('all');
    const [designRoomFilter, setDesignRoomFilter] = useState<string>('all');

    // Modals & Lightbox State
    const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);
    const [showBankDetailsModal, setShowBankDetailsModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [clientMessageText, setClientMessageText] = useState('');
    const [clientMessageSent, setClientMessageSent] = useState(false);
    const [selectedMilestoneForInvoice, setSelectedMilestoneForInvoice] = useState<PaymentMilestone | null>(null);
    const [syncedVisits, setSyncedVisits] = useState<any[]>([]);
    const [syncedMoms, setSyncedMoms] = useState<any[]>([]);
    const [selectedMomForViewer, setSelectedMomForViewer] = useState<any | null>(null);

    // Real-time Firestore sync for logged project meetings & site visits (strictly client-facing only)
    useEffect(() => {
        if (!projectData?.id || !studioId || !db) return;
        try {
            const q = query(
                collection(db, `organizations/${studioId}/projects/${projectData.id}/siteVisits`),
                orderBy('date', 'desc')
            );
            const unsubscribe = onSnapshot(q, (snap) => {
                const list: any[] = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                // Strict filter: never expose cancelled, internal, vendor, or private meetings/logs to client
                setSyncedVisits(list.filter(v => {
                    if (v.status === 'cancelled') return false;
                    if (v.isInternal === true || v.isPrivate === true || v.clientVisible === false || v.shareWithClient === false) return false;
                    if (v.visibility === 'internal' || v.visibility === 'private') return false;
                    const typeStr = String(v.type || '').toLowerCase();
                    if (typeStr === 'internal_meeting' || typeStr === 'internal' || typeStr === 'vendor_meeting' || typeStr === 'vendor' || typeStr === 'internal_review' || typeStr === 'contractor_meeting') {
                        return false;
                    }
                    const titleStr = String(v.title || '').toLowerCase();
                    if (titleStr.includes('[internal]') || titleStr.includes('internal sync') || titleStr.includes('internal meeting') || titleStr.includes('internal review') || titleStr.includes('vendor sync') || titleStr.includes('contractor sync')) {
                        return false;
                    }
                    return true;
                }));
            }, (err) => console.warn("Site visits listener:", err));
            return () => unsubscribe();
        } catch (e) {
            console.warn("Could not listen to siteVisits:", e);
        }
    }, [projectData?.id, studioId]);

    // Real-time Firestore sync for formal Minutes of Meeting (MOM) docs (strictly client-facing only)
    useEffect(() => {
        if (!projectData?.id || !studioId || !db) return;
        try {
            const q = query(
                collection(db, `organizations/${studioId}/projects/${projectData.id}/moms`),
                orderBy('meetingDate', 'desc')
            );
            const unsubscribe = onSnapshot(q, (snap) => {
                const list: any[] = [];
                snap.forEach(d => list.push({ id: d.id, ...d.data() }));
                setSyncedMoms(list.filter(m => {
                    if (m.status === 'draft' && !m.sharedAt) return false;
                    if (m.isInternal === true || m.isPrivate === true || m.clientVisible === false || m.shareWithClient === false) return false;
                    if (m.visibility === 'internal' || m.visibility === 'private') return false;
                    const typeStr = String(m.meetingType || m.type || '').toLowerCase();
                    if (typeStr === 'internal_meeting' || typeStr === 'internal' || typeStr === 'vendor_meeting' || typeStr === 'vendor' || typeStr === 'internal_review') return false;
                    const titleStr = String(m.meetingTitle || m.title || '').toLowerCase();
                    if (titleStr.includes('[internal]') || titleStr.includes('internal sync') || titleStr.includes('internal meeting')) return false;
                    return true;
                }));
            }, (err) => console.warn("MOMs listener:", err));
            return () => unsubscribe();
        } catch (e) {
            console.warn("Could not listen to moms:", e);
        }
    }, [projectData?.id, studioId]);

    // Studio Owner Quick Actions State (When viewed inside Studio App)
    const [showAddUpdateModal, setShowAddUpdateModal] = useState(false);
    const [showAddDecisionModal, setShowAddDecisionModal] = useState(false);
    
    const [newUpdateTitle, setNewUpdateTitle] = useState('');
    const [newUpdateDesc, setNewUpdateDesc] = useState('');
    const [newUpdateImageUrl, setNewUpdateImageUrl] = useState('');

    const [newDecisionTitle, setNewDecisionTitle] = useState('');
    const [newDecisionDesc, setNewDecisionDesc] = useState('');
    const [newDecisionRoom, setNewDecisionRoom] = useState('');

    const setProjectContext = (updater: any) => {
        const current = localContext || projectData.context;
        const nextContext = typeof updater === 'function' ? updater(current) : updater;
        setLocalContext(nextContext);
        if (onProjectUpdate) {
            setTimeout(() => {
                onProjectUpdate({
                    ...projectData,
                    context: nextContext
                });
            }, 0);
        }
    };

    // Filter out drafts

    
    // Resolved once, from the canonical approval engine, so the studio banner
    // and the client approvals tab can never report different states.
    const displayUpdates = updates.filter(u => u.status !== 'draft');

    const activeTier = useMemo(() => {
        // Prefer tier explicitly marked as approved or matching approvedTierId
        const approved = tiers.find(t => t.id === context.approvedTierId || (t as any).status === 'approved' || (t as any).approved === true);
        if (approved) return approved;
        if (projectData.activeTierId) {
            return tiers.find(t => t.id === projectData.activeTierId) || tiers[0];
        }
        return context.approvedTierId ? tiers.find(t => t.id === context.approvedTierId) : tiers[0];
    }, [projectData.activeTierId, context.approvedTierId, tiers]);

    const [operativeBoq, setOperativeBoq] = useState<any>(null);
    useEffect(() => {
        if (context.operativeBoqVersion && projectData.id && functions) {
            const getBoq = httpsCallable(functions, 'getOperativeBoq');
            getBoq({ orgId: studioId, projectId: projectData.id })
                .then(res => setOperativeBoq(res.data))
                .catch(err => console.error("Failed to load operative BOQ", err));
        }
    }, [context.operativeBoqVersion, projectData.id, studioId]);

    const displayBoq = operativeBoq?.itemsSnapshot ? operativeBoq.itemsSnapshot : (activeTier?.fullBoq || activeTier?.boq || []);

    // --- CLIENT TIMELINE & GANTT STATE ---
    const [roadmapViewMode, setRoadmapViewMode] = useState<'gantt' | 'milestones'>('gantt');
    const [showTimelineReportModal, setShowTimelineReportModal] = useState(false);
    const [customSchedule, setCustomSchedule] = useState<ProjectSchedule | null>(null);

    useEffect(() => {
        if (!projectData?.id) return;
        let active = true;
        storageDb.getSchedule(projectData.id).then(saved => {
            if (active && saved) {
                setCustomSchedule(saved);
            }
        }).catch(err => console.warn("Failed to load schedule in client portal", err));
        return () => { active = false; };
    }, [projectData?.id]);

    const clientSchedule = useMemo(() => {
        if (customSchedule) return customSchedule;
        return buildScheduleFromProject(projectData.context, displayBoq);
    }, [customSchedule, projectData.context, displayBoq]);

    // --- BOQ CATEGORIZATION & REVISIONS ---
    const boqRevisions = context.boqRevisions || [];

    const boqByCategory = useMemo(() => {
        if (!activeTier) return {};

        const validRoomNames = new Set(projectData.context.rooms?.map(r => r.name) || []);
        const bankMap = new Map<string, any>(bank.map(b => [b.id, b]));

        const baselineBoq: any[] = displayBoq.map((item: any, idx: number) => {
            const bankItem = bankMap.get(item.bankId);
            
            const itemTitle = item.item || item.name || bankItem?.name || 'Deliverable Item';
            const itemCat = item.cat || item.category || bankItem?.cat || 'General Scope';
            const itemUnit = item.unit || bankItem?.unit || 'nos';
            const itemSpecs = item.description || item.specs || item.rationale || bankItem?.specs || '';
            const itemQty = item.qty !== undefined ? item.qty : 1;

            let sellPrice = 0;
            if (item.rate !== undefined && Number(item.rate) > 0) {
                sellPrice = Number(item.rate);
            } else if (item.selectedRate !== undefined && Number(item.selectedRate) > 0) {
                sellPrice = Number(item.selectedRate);
            } else if (item.sellPrice !== undefined && Number(item.sellPrice) > 0) {
                sellPrice = Number(item.sellPrice);
            } else if (bankItem) {
                const materials = item.materials ?? item.baseRate ?? bankItem.materials;
                const labor = item.labor ?? bankItem.labor;
                const margin = item.marginOverride ?? item.margin ?? bankItem.margin;
                sellPrice = calculateSellPrice(materials, labor, margin);
            } else if (item.total && itemQty > 0) {
                sellPrice = Number(item.total) / itemQty;
            }

            const totalVal = item.total !== undefined ? Number(item.total) : (sellPrice * itemQty);

            const groupKey = (item.roomId && validRoomNames.has(item.roomId)) 
                ? item.roomId 
                : (item.roomId || (validRoomNames.has(itemCat) ? itemCat : 'General Scope'));

            return {
                ...item,
                id: item.id || `boq-item-${item.bankId || 'item'}-${idx}`,
                roomId: groupKey,
                item: itemTitle,
                cat: itemCat,
                unit: itemUnit,
                qty: itemQty,
                rate: sellPrice,
                total: totalVal,
                description: itemSpecs,
                status: item.status || 'Approved'
            };
        }).filter(Boolean);

        let workingBoq = JSON.parse(JSON.stringify(baselineBoq));

        boqRevisions.forEach(action => {
            if (action.type === 'ADD') {
                workingBoq.push({
                    id: action.id,
                    roomId: action.section,
                    item: action.item,
                    unit: action.newValue?.unit || 'nos',
                    qty: action.newValue?.qty || 1,
                    rate: action.newValue?.rate || 0,
                    total: (action.newValue?.qty || 1) * (action.newValue?.rate || 0),
                    status: 'Added',
                    description: action.note,
                });
            } else {
                const targetIndex = workingBoq.findIndex((i: any) => action.targetId ? i.id === action.targetId : (i.roomId === action.section && i.item === action.item));
                if (targetIndex >= 0) {
                    if (action.type === 'REMOVE') {
                        workingBoq[targetIndex].status = 'Removed';
                        workingBoq[targetIndex].qty = 0;
                        workingBoq[targetIndex].total = 0;
                    } else if (action.type === 'REVISE_QTY') {
                        workingBoq[targetIndex].qty = action.newValue;
                        workingBoq[targetIndex].total = action.newValue * workingBoq[targetIndex].rate;
                        workingBoq[targetIndex].status = 'Revised';
                    }
                }
            }
        });

        const grouped: Record<string, any[]> = {};
        workingBoq.forEach((item: any) => {
            if (item.status === 'Removed' && item.qty === 0) return;
            const groupKey = item.roomId || 'General Scope';
            if (!grouped[groupKey]) grouped[groupKey] = [];
            grouped[groupKey].push(item);
        });

        return grouped;
    }, [activeTier, bank, projectData.context.rooms, boqRevisions, displayBoq]);

    // Flat list and categorization helpers for Focus Scope View
    const flatBoqList = useMemo(() => {
        const list: any[] = [];
        Object.entries(boqByCategory).forEach(([roomKey, items]) => {
            (items as any[]).forEach(item => {
                list.push({
                    ...item,
                    roomGroup: roomKey,
                    tradeCategory: item.cat || 'General Scope'
                });
            });
        });
        return list;
    }, [boqByCategory]);

    const totalScopeValue = useMemo(() => {
        return flatBoqList.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    }, [flatBoqList]);

    const roomSubtotals = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {};
        flatBoqList.forEach(item => {
            const r = item.roomId || item.roomGroup || 'General Scope';
            if (!map[r]) map[r] = { count: 0, total: 0 };
            map[r].count += 1;
            map[r].total += (Number(item.total) || 0);
        });
        return map;
    }, [flatBoqList]);

    const allBoqRooms = useMemo(() => {
        return Array.from(new Set(flatBoqList.map(i => i.roomId || i.roomGroup).filter(Boolean)));
    }, [flatBoqList]);

    const allBoqTrades = useMemo(() => {
        return Array.from(new Set(flatBoqList.map(i => i.cat || 'General Scope').filter(Boolean)));
    }, [flatBoqList]);

    // --- FINANCIAL CALCULATIONS ---
    const financials = context.financials || {
        initiationFeePaid: 4999,
        billablePercent: 100,
        executionGstEnabled: true,
        projectedCashValue: 0,
        taxLimitYearly: 2000000,
        goodwillDiscount: 0,
        discounts: []
    };

    const gstRate = context.gstRate || 18;
    const initiationFee = financials.initiationFeePaid;
    const billablePercent = financials.billablePercent;
    const executionGstEnabled = financials.executionGstEnabled;
    const discounts = financials.discounts || [];

    const originalExecutionTotal = activeTier?.summary.totalSell || 0;
    const originalDesignFee = activeTier?.summary.designFee || 0;

    // Dynamically sync execution value with revised totalScopeValue when revisions exist or when BOQ is active
    const hasActiveBoqRevisions = boqRevisions.length > 0 || !!operativeBoq?.itemsSnapshot;
    const effectiveExecutionValue = (hasActiveBoqRevisions && totalScopeValue > 0)
        ? totalScopeValue
        : (financials.approvedExecutionValue ?? (totalScopeValue > 0 ? totalScopeValue : originalExecutionTotal));

    const rawExecutionTotal = effectiveExecutionValue;
    const rawDesignFee = financials.approvedDesignValue ?? originalDesignFee;

    const calculateDiscountValue = (base: number, target: 'execution' | 'design') => {
        const targetDiscounts = discounts.filter(d => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach(d => {
            if (d.type === 'percentage') {
                totalDeduction += base * (d.value / 100);
            } else {
                totalDeduction += d.value;
            }
        });
        return totalDeduction;
    };

    const executionDiscountVal = calculateDiscountValue(rawExecutionTotal, 'execution');
    const designDiscountVal = calculateDiscountValue(rawDesignFee, 'design');

    const taxableExecution = Math.max(0, rawExecutionTotal - executionDiscountVal);
    const taxableDesign = Math.max(0, rawDesignFee - designDiscountVal);

    const executionBillable = taxableExecution * (billablePercent / 100);
    const executionCash = taxableExecution * ((100 - billablePercent) / 100);

    const gstOnExecution = executionGstEnabled ? (executionBillable * (gstRate / 100)) : 0;
    const gstOnDesign = taxableDesign * (gstRate / 100);
    const totalGST = gstOnExecution + gstOnDesign;

    const currentProjectValue = executionBillable + executionCash + taxableDesign + totalGST;
    const baseProjectValue = originalExecutionTotal + originalDesignFee + (originalExecutionTotal * (gstRate/100)) + (originalDesignFee * (gstRate/100));

    // Calculate Paid Amount
    const milestones = context.paymentMilestones || [];
    let totalPaid = initiationFee;
    
    const calculateMilestoneTotal = (m: PaymentMilestone) => {
        let baseAmount = taxableExecution;
        if (m.type === 'design') baseAmount = taxableDesign;
        if (m.lockedTaxableBase !== undefined) baseAmount = m.lockedTaxableBase;
        
        const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100);
        
        let rowBillable = rowBaseOriginal;
        let rowCash = 0;
        let applicableGstRate = gstRate;
        
        if (m.type === 'execution') {
            rowBillable = rowBaseOriginal * (billablePercent / 100);
            rowCash = rowBaseOriginal * (Math.max(0, 100 - billablePercent) / 100);
            if (!executionGstEnabled) applicableGstRate = 0;
        }
        
        const rowGST = rowBillable * (applicableGstRate / 100);
        return rowBillable + rowCash + rowGST;
    };

    milestones.forEach(m => {
        if (m.status === 'paid') {
            totalPaid += calculateMilestoneTotal(m);
        }
    });

    const paidPercentage = currentProjectValue > 0 ? Math.min(100, Math.round((totalPaid / currentProjectValue) * 100)) : 0;
    const balanceDue = Math.max(0, currentProjectValue - totalPaid);

    // Breakdowns for fee tracking
    const totalDesignValue = taxableDesign + gstOnDesign;
    const totalExecutionValue = executionBillable + executionCash + gstOnExecution;
    
    let designPaid = initiationFee; // Initiation goes towards design
    let executionPaid = 0;
    milestones.forEach(m => {
        if (m.status === 'paid') {
            if (m.type === 'design') {
                designPaid += calculateMilestoneTotal(m);
            } else if (m.type === 'execution') {
                executionPaid += calculateMilestoneTotal(m);
            }
        }
    });

    const designPaidPercentage = totalDesignValue > 0 ? Math.min(100, Math.round((designPaid / totalDesignValue) * 100)) : 0;
    const executionPaidPercentage = totalExecutionValue > 0 ? Math.min(100, Math.round((executionPaid / totalExecutionValue) * 100)) : 0;

    // --- SMART CLIENT ACTION ENGINE & LIFECYCLE PIPELINE ---
    const milestoneTotalsMap = useMemo(() => {
        const map: { [id: string]: number } = {};
        milestones.forEach(m => {
            if (m && m.id) {
                map[m.id] = calculateMilestoneTotal(m);
            }
        });
        return map;
    }, [milestones, taxableExecution, taxableDesign, billablePercent, executionGstEnabled, gstRate]);

    const lifecycleInfo = useMemo(() => {
        return calculateClientLifecycleStages(context);
    }, [context]);

    const clientActionSummary = useMemo(() => {
        return calculateClientActionItems(context, projectData, milestoneTotalsMap);
    }, [context, projectData, milestoneTotalsMap]);

    const upcomingSteps = useMemo(() => {
        return getUpcomingStudioSteps(lifecycleInfo.currentStageNumber, context);
    }, [lifecycleInfo.currentStageNumber, context]);

    // Approval snapshot resolved from every legacy sign-off field family.
    const approvals = lifecycleInfo.approvals;
    // Only items genuinely in the client's court count as "pending" for badges.
    const clientPendingCount = clientActionSummary.clientActions.length;

    // Documents released to the client and not yet executed. A document sitting
    // with the studio, or one the client has queried, is deliberately excluded —
    // neither is theirs to act on.
    const documentsNeedingAttention = useMemo(() => {
        const kinds: ClientDocumentKind[] = [
            'terms_docket', 'payment_schedule', 'execution_agreement',
            'onboarding_kit', 'handover_docket'
        ];
        return kinds.filter(k => {
            const st = resolveDocumentState(context, k);
            return st === 'issued' || st === 'amended';
        }).length;
    }, [context]);

    // --- ACTION REQUIRED ITEMS ---
    const pendingUpdates = displayUpdates.filter(u => u.status === 'pending_approval');
    const pendingClientDecisions = decisions.filter(d => d.status === 'proposed' || d.status === 'pending');
    
    const duePayments = milestones.filter(m => m.status === 'invoiced').map(m => {
        return {
            ...m,
            paymentAmount: calculateMilestoneTotal(m),
            dateString: m.invoiceDate || m.date || 'Immediate'
        };
    });

    // --- ROOM PROGRESS MATRIX ---
    const roomsList = useMemo(() => {
        return projectData.context.rooms || [];
    }, [projectData.context.rooms]);

    const roomProgressData = useMemo(() => {
        const weeklyProgress = context.weeklyRoomProgress || {};
        const itemStatuses = context.itemExecutionStatuses || {};

        return roomsList.map((r, idx) => {
            const roomId = r.id || `room-${idx}`;
            const roomNameLower = (r.name || '').toLowerCase().trim();

            // Find matching data in weeklyRoomProgress (by id, roomId, or name)
            const roomData = (r.id && weeklyProgress[r.id] && r.id !== 'undefined')
                ? weeklyProgress[r.id]
                : (weeklyProgress[roomId] && roomId !== 'undefined')
                    ? weeklyProgress[roomId]
                    : (r.name && weeklyProgress[r.name] && r.name !== 'undefined')
                        ? weeklyProgress[r.name]
                        : null;

            if (roomData && Object.keys(roomData).length > 0) {
                const activeStageKey = Object.keys(roomData)[0] || 'Current';
                const stageInfo = roomData[activeStageKey];
                if (stageInfo && typeof stageInfo.progress === 'number') {
                    return {
                        id: roomId,
                        name: r.name,
                        progress: Math.min(100, Math.max(0, stageInfo.progress)),
                        stage: stageInfo.stage || (stageInfo.progress === 100 ? 'Handover Completed' : stageInfo.progress > 0 ? 'In Progress' : 'Pending Execution Start')
                    };
                }
            }

            // If no explicit weeklyRoomProgress entry, check item-level statuses
            const rItems = flatBoqList.filter(item => {
                const iRoom = (item.roomId || item.room || item.roomName || item.roomGroup || '').toLowerCase();
                return iRoom === roomNameLower || (r.id && iRoom === r.id.toLowerCase());
            });

            if (rItems.length > 0) {
                let comp = 0;
                let inProg = 0;
                rItems.forEach(i => {
                    const iId = i.id || i.tempId;
                    const st = iId && itemStatuses[iId];
                    if (st === 'completed') comp++;
                    else if (st === 'in_progress') inProg++;
                });

                if (comp > 0 || inProg > 0) {
                    const calcProg = Math.round(((comp * 1.0 + inProg * 0.5) / rItems.length) * 100);
                    let calcStage = 'Carpentry & Assembly';
                    if (calcProg === 100) calcStage = 'Handover Completed';
                    else if (calcProg >= 80) calcStage = 'Painting & Finishes';
                    else if (calcProg >= 50) calcStage = 'Carpentry & Assembly';
                    else if (calcProg >= 30) calcStage = 'False Ceiling & Framing';
                    else if (calcProg > 0) calcStage = 'Civil & MEP Layouts';

                    return {
                        id: roomId,
                        name: r.name,
                        progress: calcProg,
                        stage: calcStage
                    };
                }
            }

            return {
                id: roomId,
                name: r.name,
                progress: 0,
                stage: 'Pending Execution Start'
            };
        });
    }, [roomsList, context.weeklyRoomProgress, context.itemExecutionStatuses, flatBoqList]);

    // Helper for category styling & visual cues
    const getCategoryInfo = (catName: string = '') => {
        const lower = catName.toLowerCase();
        if (lower.includes('carpentry') || lower.includes('wood') || lower.includes('furniture') || lower.includes('wardrobe')) {
            return { label: 'Carpentry & Joinery', color: 'bg-amber-50 text-amber-900 border-amber-200', badgeColor: 'bg-amber-500', icon: Layers };
        }
        if (lower.includes('electrical') || lower.includes('light') || lower.includes('automation') || lower.includes('switch')) {
            return { label: 'Electrical & Lighting', color: 'bg-yellow-50 text-yellow-900 border-yellow-200', badgeColor: 'bg-yellow-500', icon: Sparkles };
        }
        if (lower.includes('ceiling') || lower.includes('gypsum') || lower.includes('pop')) {
            return { label: 'False Ceiling & POP', color: 'bg-sky-50 text-sky-900 border-sky-200', badgeColor: 'bg-sky-500', icon: Maximize2 };
        }
        if (lower.includes('civil') || lower.includes('masonry') || lower.includes('tile') || lower.includes('flooring') || lower.includes('granite')) {
            return { label: 'Civil & Flooring', color: 'bg-stone-50 text-stone-900 border-stone-200', badgeColor: 'bg-stone-500', icon: Building2 };
        }
        if (lower.includes('paint') || lower.includes('finish') || lower.includes('wall') || lower.includes('polish') || lower.includes('veneer')) {
            return { label: 'Finishes & Painting', color: 'bg-purple-50 text-purple-900 border-purple-200', badgeColor: 'bg-purple-500', icon: FileEdit };
        }
        if (lower.includes('plumb') || lower.includes('sanitary') || lower.includes('bath')) {
            return { label: 'Plumbing & Sanitary', color: 'bg-blue-50 text-blue-900 border-blue-200', badgeColor: 'bg-blue-500', icon: Info };
        }
        return { label: catName || 'General Scope', color: 'bg-slate-50 text-slate-800 border-slate-200', badgeColor: 'bg-slate-500', icon: Layers };
    };

    // Clean author helper to prevent raw Firebase UIDs from leaking into client-facing UI
    const formatCleanAuthor = (authorVal?: any): string => {
        if (!authorVal) return studioCompanyName || 'Form Factors Design Studio';
        const str = String(authorVal).trim();
        // Detect raw Firebase Auth UIDs (long alphanumeric strings without spaces)
        if (str.length >= 16 && !str.includes(' ') && !str.includes('@')) {
            return studioCompanyName || 'Form Factors Design Studio';
        }
        if (str.includes('@')) {
            const prefix = str.split('@')[0];
            return prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return str;
    };

    // Helper to process raw meeting and MoM records into an executive digest & structured highlights
    const processMoMFeedData = (mom: any, idx: number) => {
        const rawDecisions = mom.decisions || mom.momData?.decisions || [];
        const decisionsList = rawDecisions.map((d: any, dIdx: number) => {
            if (typeof d === 'string') return { id: `d-${dIdx}`, text: d };
            return { id: d.id || `d-${dIdx}`, text: d.text || d.decision || d.title || '' };
        }).filter((d: any) => d.text && d.text.trim().length > 0);

        const rawActions = mom.actionItems || mom.actions || mom.momData?.actionItems || mom.momData?.actions || [];
        const actionList = rawActions.map((a: any, aIdx: number) => {
            if (typeof a === 'string') return { id: `a-${aIdx}`, text: a, owner: 'Team' };
            return {
                id: a.id || `a-${aIdx}`,
                text: a.text || a.task || a.action || a.title || 'Action item',
                owner: a.ownerName || a.owner || 'Project Lead',
                dueDate: a.dueDate || a.targetDate || null
            };
        }).filter((a: any) => a.text && a.text.trim().length > 0);

        // Extract raw notes / scope text if present
        const rawNotesText = (
            mom.scopeFlagSummary || 
            mom.momData?.scopeFlagSummary ||
            (typeof mom.notes === 'string' ? mom.notes : (Array.isArray(mom.notes) ? mom.notes.join('. ') : '')) || 
            mom.description || 
            mom.discussionSummary || 
            ''
        ).trim();

        // Parse highlights / scope items
        let highlights: string[] = [];
        const discussionPoints = mom.discussionPoints || mom.momData?.discussionPoints;
        if (Array.isArray(discussionPoints) && discussionPoints.length > 0) {
            highlights = discussionPoints
                .map((p: any) => typeof p === 'string' ? p : (p.topic || p.text || p.title || ''))
                .filter((p: string) => p && p.trim().length > 0);
        } else if (rawNotesText) {
            // Parse list if it contains keywords like "including", commas, semicolons, bullets
            let targetText = rawNotesText;
            const incMatch = targetText.match(/(?:including|such as|points:|items:|scope:|provisions:)\s*(.*)/i);
            if (incMatch && incMatch[1]) {
                targetText = incMatch[1];
            }
            const parts = targetText
                .split(/[,;\n•\r]|\band\b/i)
                .map((p: string) => p.trim().replace(/^[-*•\d.)\s]+/, '').replace(/[.]+$/, ''))
                .filter((p: string) => p.length > 2 && !['and', 'the', 'also', 'etc', 'flats'].includes(p.toLowerCase()))
                .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1));
            
            if (parts.length > 1) {
                highlights = parts.slice(0, 6);
            } else if (rawNotesText.length > 0 && rawNotesText.length < 120 && !rawNotesText.includes('.')) {
                highlights = [rawNotesText];
            }
        }

        // Build polished executive narrative summary
        let executiveSummary = mom.executiveSummary || mom.momData?.executiveSummary || mom.summary || mom.momData?.summary;
        if (!executiveSummary || typeof executiveSummary !== 'string' || executiveSummary.trim().length < 15) {
            if (highlights.length > 0) {
                executiveSummary = `The design team and client stakeholders aligned on key project requirements and spatial optimizations. Key architectural provisions, joinery specifications, and utility configurations were evaluated and recorded into official project records.`;
            } else if (decisionsList.length > 0 && actionList.length > 0) {
                executiveSummary = `Consultation completed with ${decisionsList.length} design specifications formally approved and ${actionList.length} scheduled milestone action items logged for project execution.`;
            } else if (decisionsList.length > 0) {
                executiveSummary = `Milestone consultation concluded with ${decisionsList.length} design specifications and material selections confirmed.`;
            } else if (actionList.length > 0) {
                executiveSummary = `Coordination session completed with ${actionList.length} scheduled action items established for execution tracking.`;
            } else {
                executiveSummary = 'Official Minutes of Meeting compiled and approved for client review and project records.';
            }
        }

        let meetingDateVal = mom.meetingDate || mom.date || Date.now();
        if (meetingDateVal?.toDate) {
            meetingDateVal = meetingDateVal.toDate().getTime();
        } else if (typeof meetingDateVal === 'string') {
            meetingDateVal = new Date(meetingDateVal).getTime();
        }
        const momRefStr = mom.momRef || mom.momData?.momRef || `MOM-${new Date(meetingDateVal).getFullYear()}-${String(mom.id || idx).slice(-3).toUpperCase()}`;

        return {
            decisionsList,
            actionList,
            highlights,
            executiveSummary,
            momRefStr,
            meetingDateVal
        };
    };

    // --- AUTOMATIC OPS LIVE FEED ---
    const liveFeed = useMemo(() => {
        const feed: any[] = [];
        const seenIds = new Set<string>();

        // 1. Site Log Photos & Updates from Ops (client-visible only)
        siteUpdates.forEach((su, idx) => {
            const suAny = su as any;
            if (suAny.isInternal === true || suAny.visibility === 'internal' || suAny.visibility === 'private' || suAny.clientVisible === false) {
                return;
            }
            const feedId = `su-${su.id || idx}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);
                feed.push({
                    id: feedId,
                    type: 'site_update',
                    title: su.title || 'Site Inspection & Progress Update',
                    date: new Date(su.date),
                    description: su.description,
                    author: formatCleanAuthor(su.author || 'Site Operations Team'),
                    images: su.images || [],
                    tags: su.tags || [],
                    data: su
                });
            }
        });

        // 2. Project Updates / Scope Variations
        displayUpdates.forEach((pu, idx) => {
            const feedId = `pu-${pu.id || idx}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);
                feed.push({
                    id: feedId,
                    type: 'project_update',
                    title: `Scope Variation: ${pu.title}`,
                    date: new Date(pu.date),
                    description: `Requested scope adjustment (${pu.type.replace('_', ' ')}) with net impact ${formatINR(pu.netImpact)}.`,
                    status: pu.status,
                    data: pu
                });
            }
        });

        // 3. Payment Milestones
        milestones.forEach((m, idx) => {
            if (m.status === 'paid' || m.status === 'invoiced') {
                const feedId = `pm-${m.id || idx}`;
                if (!seenIds.has(feedId)) {
                    seenIds.add(feedId);
                    feed.push({
                        id: feedId,
                        type: 'payment',
                        title: `Payment ${m.status === 'paid' ? 'Received' : 'Invoiced'}: ${m.name}`,
                        date: new Date(m.invoiceDate || m.date || Date.now()),
                        description: `Milestone ${m.percentage}% (${m.type.toUpperCase()}) — ${m.description || 'Project Stage Invoice'}`,
                        amount: calculateMilestoneTotal(m),
                        status: m.status,
                        data: m
                    });
                }
            }
        });

        // 4. Client Decisions
        decisions.forEach((d, idx) => {
            const feedId = `dec-${d.id || idx}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);
                feed.push({
                    id: feedId,
                    type: 'decision',
                    title: `Design Selection: ${d.title}`,
                    date: new Date(d.date || Date.now()),
                    description: d.description || `Required finish choice for ${d.roomId || 'Site Scope'}.`,
                    status: d.status,
                    data: d
                });
            }
        });

        // 5. Minutes of Meeting (MoM) from Firestore & Context (Primary source of truth for all client meetings)
        const allMomsList: any[] = [...syncedMoms, ...((context as any).momHistory || [])];
        const processedMomIds = new Set<string>();

        allMomsList.forEach((mom: any, idx: number) => {
            if (!mom) return;
            const momKey = String(mom.id || `mom-${idx}`);
            if (processedMomIds.has(momKey)) return;
            processedMomIds.add(momKey);

            // Guard: completely exclude any internal/vendor meeting notes or unshared drafts
            if (mom.isInternal === true || mom.isPrivate === true || mom.clientVisible === false || mom.shareWithClient === false) {
                return;
            }
            if (mom.visibility === 'internal' || mom.visibility === 'private') {
                return;
            }
            const mType = String(mom.meetingType || mom.type || '').toLowerCase();
            if (mType === 'internal' || mType === 'internal_meeting' || mType === 'vendor' || mType === 'vendor_meeting' || mType === 'internal_review') {
                return;
            }
            const titleStr = String(mom.title || mom.meetingTitle || '').toLowerCase();
            if (titleStr.includes('[internal]') || titleStr.includes('internal sync') || titleStr.includes('internal meeting') || titleStr.includes('internal review') || titleStr.includes('vendor sync')) {
                return;
            }
            const isClientShared = mom.status === 'shared' || mom.status === 'published' || mom.status === 'finalised' || mom.status === 'acknowledged' || mom.sharedAt;
            if (!isClientShared && mom.status === 'draft') {
                return;
            }

            const feedId = `mom-${momKey}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);

                const {
                    decisionsList,
                    actionList,
                    highlights,
                    executiveSummary,
                    momRefStr,
                    meetingDateVal
                } = processMoMFeedData(mom, idx);

                const resolvedAuthor = formatCleanAuthor(mom.createdByName || mom.authorName || mom.recordedBy || (mom.createdBy && mom.createdBy.length < 18 ? mom.createdBy : null));

                feed.push({
                    id: feedId,
                    type: 'meeting',
                    title: mom.meetingTitle || mom.title || `Minutes of Meeting: ${momRefStr}`,
                    date: new Date(meetingDateVal),
                    description: executiveSummary,
                    executiveSummary: executiveSummary,
                    highlights: highlights,
                    status: mom.status || 'finalised',
                    isAcknowledged: mom.status === 'acknowledged' || !!mom.acknowledgedAt,
                    author: resolvedAuthor,
                    attendees: mom.attendees || [],
                    actionItems: actionList,
                    decisions: decisionsList,
                    momRef: momRefStr,
                    hasMoM: true,
                    momData: mom,
                    data: mom
                });
            }
        });

        // 6. Synced Meetings & Site Visits from Firestore Project Subcollection (strictly client-facing only)
        syncedVisits.forEach((v: any, idx: number) => {
            // Guard: completely exclude any internal/vendor meetings or non-client logs
            if (v.isInternal === true || v.isPrivate === true || v.clientVisible === false || v.shareWithClient === false) {
                return;
            }
            if (v.visibility === 'internal' || v.visibility === 'private') {
                return;
            }
            const typeStr = String(v.type || '').toLowerCase();
            if (typeStr === 'internal_meeting' || typeStr === 'internal' || typeStr === 'vendor_meeting' || typeStr === 'vendor' || typeStr === 'internal_review' || typeStr === 'contractor_meeting') {
                return;
            }
            const titleStr = String(v.title || '').toLowerCase();
            if (titleStr.includes('[internal]') || titleStr.includes('internal sync') || titleStr.includes('internal meeting') || titleStr.includes('internal review') || titleStr.includes('vendor sync') || titleStr.includes('contractor sync')) {
                return;
            }

            // Check if this visit corresponds to an already added MoM
            const isClientMeeting = v.type === 'client_meeting' || (v.isVirtual && !typeStr.includes('internal')) || (v.title && v.title.toLowerCase().includes('client'));
            if (isClientMeeting) {
                const matchedExistingMom = allMomsList.find(m => 
                    (m.id && v.momId === m.id) || 
                    (m.meetingId && m.meetingId === v.id) ||
                    (m.id && v.id && String(m.id).toLowerCase() === String(v.id).toLowerCase())
                );
                if (matchedExistingMom) {
                    // Already represented by the official MoM item
                    return;
                }
            }

            const feedId = `visit-${v.id || idx}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);
                
                let rawDate = Date.now();
                if (v.date?.toDate) {
                    rawDate = v.date.toDate();
                } else if (v.date) {
                    rawDate = new Date(v.date).getTime();
                }

                if (isClientMeeting) {
                    const {
                        decisionsList,
                        actionList,
                        highlights,
                        executiveSummary,
                        momRefStr,
                        meetingDateVal
                    } = processMoMFeedData({ ...v, ...v.momData, date: rawDate }, idx);

                    const synthesizedMom = {
                        id: v.id || `synced-${idx}`,
                        meetingTitle: v.title || 'Client Strategy & Alignment Meeting',
                        meetingDate: meetingDateVal,
                        attendees: v.attendees || [],
                        decisions: decisionsList,
                        actionItems: actionList,
                        executiveSummary: executiveSummary,
                        highlights: highlights,
                        notes: typeof v.notes === 'string' ? [v.notes] : (Array.isArray(v.notes) ? v.notes : []),
                        momRef: momRefStr,
                        status: v.status || 'completed',
                        createdBy: formatCleanAuthor(v.createdByName || v.authorName || 'Design Studio PM')
                    };

                    feed.push({
                        id: feedId,
                        type: 'meeting',
                        title: v.title || `Minutes of Meeting: ${momRefStr}`,
                        date: new Date(meetingDateVal),
                        description: executiveSummary,
                        executiveSummary: executiveSummary,
                        highlights: highlights,
                        status: v.status || 'completed',
                        isAcknowledged: v.status === 'acknowledged' || !!v.acknowledgedAt,
                        author: formatCleanAuthor(v.createdByName || v.authorName || 'Design Studio PM'),
                        attendees: v.attendees || [],
                        actionItems: actionList,
                        decisions: decisionsList,
                        startTime: v.startTime,
                        durationMinutes: v.durationMinutes,
                        isVirtual: v.isVirtual,
                        location: v.location,
                        momRef: momRefStr,
                        hasMoM: true,
                        momData: synthesizedMom,
                        data: synthesizedMom
                    });
                } else {
                    feed.push({
                        id: feedId,
                        type: 'site_update',
                        title: v.title || 'Site Progress & Inspection Visit',
                        date: new Date(rawDate),
                        description: v.notes || `Site survey for ${v.phaseTitle || 'Execution Stage'}.`,
                        author: formatCleanAuthor(v.recordedBy || v.createdByName || 'Site Operations PM'),
                        images: v.photos || [],
                        tags: [v.phaseTitle || 'Site Visit', v.type || 'site_survey'].filter(Boolean),
                        data: v
                    });
                }
            }
        });

        // 7. Site Visits from context (strictly client-facing only)
        const siteVisits = (context as any).siteVisits || [];
        siteVisits.forEach((sv: any, idx: number) => {
            if (sv.isInternal === true || sv.isPrivate === true || sv.clientVisible === false || sv.shareWithClient === false) {
                return;
            }
            if (sv.visibility === 'internal' || sv.visibility === 'private') {
                return;
            }
            const svType = String(sv.type || '').toLowerCase();
            if (svType === 'internal_meeting' || svType === 'internal' || svType === 'vendor_meeting' || svType === 'vendor' || svType === 'internal_review' || svType === 'contractor_meeting') {
                return;
            }
            const titleStr = String(sv.title || '').toLowerCase();
            if (titleStr.includes('[internal]') || titleStr.includes('internal sync') || titleStr.includes('internal meeting') || titleStr.includes('internal review') || titleStr.includes('vendor sync')) {
                return;
            }

            const feedId = `sv-${sv.id || idx}`;
            if (!seenIds.has(feedId)) {
                seenIds.add(feedId);
                const isMeeting = sv.type === 'client_meeting' || (sv.isVirtual && !svType.includes('internal'));
                if (isMeeting) {
                    const momRefStr = `MOM-${new Date(sv.date || Date.now()).getFullYear()}-${String(sv.id || idx).slice(-3).toUpperCase()}`;
                    const synthesizedMom = {
                        id: sv.id || `sv-${idx}`,
                        meetingTitle: sv.title || 'Client Project Discussion',
                        meetingDate: sv.date?.toDate ? sv.date.toDate() : (sv.date || Date.now()),
                        attendees: sv.attendees || [],
                        decisions: [],
                        actionItems: [],
                        momRef: momRefStr,
                        status: 'completed',
                        createdBy: sv.loggedBy || 'Site Team'
                    };
                    feed.push({
                        id: feedId,
                        type: 'meeting',
                        title: sv.title || `Minutes of Meeting: ${momRefStr}`,
                        date: new Date(sv.date?.toDate ? sv.date.toDate() : (sv.date || Date.now())),
                        description: 'Client design review conducted on site. Meeting minutes and alignment points recorded.',
                        status: 'completed',
                        author: sv.loggedBy || 'Site Team',
                        attendees: sv.attendees || [],
                        momRef: momRefStr,
                        hasMoM: true,
                        momData: synthesizedMom,
                        data: synthesizedMom
                    });
                } else if (sv.notes) {
                    feed.push({
                        id: feedId,
                        type: 'site_update',
                        title: sv.title || 'Site Inspection & Progress Update',
                        date: new Date(sv.date?.toDate ? sv.date.toDate() : (sv.date || Date.now())),
                        description: sv.notes,
                        status: 'completed',
                        author: sv.loggedBy || 'Site Team',
                        attendees: sv.attendees || [],
                        data: sv
                    });
                }
            }
        });

        return feed.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [siteUpdates, displayUpdates, milestones, decisions, syncedVisits, syncedMoms, (context as any).momHistory, (context as any).siteVisits]);

    const filteredLiveFeed = useMemo(() => {
        let items = liveFeed;
        if (feedCategoryFilter === 'site') items = items.filter(f => f.type === 'site_update');
        if (feedCategoryFilter === 'meetings') items = items.filter(f => f.type === 'meeting');
        if (feedCategoryFilter === 'variations') items = items.filter(f => f.type === 'project_update');
        if (feedCategoryFilter === 'payments') items = items.filter(f => f.type === 'payment');
        if (feedCategoryFilter === 'decisions') items = items.filter(f => f.type === 'decision');

        if (feedSearchQuery.trim()) {
            const q = feedSearchQuery.toLowerCase();
            items = items.filter(i => 
                i.title.toLowerCase().includes(q) || 
                (i.description && i.description.toLowerCase().includes(q))
            );
        }

        return items;
    }, [liveFeed, feedCategoryFilter, feedSearchQuery]);

    // --- ACTIONS & HANDLERS ---
    const handleApproveDecisionOption = (decisionId: string, selectedOption: string) => {
        const updatedDecisions = decisions.map(d => {
            if (d.id === decisionId) {
                return {
                    ...d,
                    status: 'confirmed' as const,
                    selectedOption: selectedOption,
                };
            }
            return d;
        });
        setProjectContext((prev: any) => ({
            ...prev,
            projectDecisions: updatedDecisions
        }));
    };

    const handleConfirmMaterialSelection = (matId: string) => {
        const updatedMaterials = materialSelections.map(m => {
            if (m.id === matId) {
                return {
                    ...m,
                    status: 'approved' as const,
                    clientConfirmedAt: new Date().toISOString()
                };
            }
            return m;
        });
        setProjectContext((prev: any) => ({
            ...prev,
            materialSelections: updatedMaterials
        }));
    };

    const handleAddSiteUpdateFromStudio = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUpdateTitle.trim()) return;

        const newRecord: SiteUpdateRecord = {
            id: `su-${Date.now()}`,
            date: new Date().toISOString(),
            title: newUpdateTitle,
            description: newUpdateDesc,
            author: `${studioCompanyName} Operations`,
            images: newUpdateImageUrl ? [newUpdateImageUrl] : [],
            tags: ['Site Inspection']
        };

        setProjectContext((prev: any) => ({
            ...prev,
            siteUpdates: [newRecord, ...(prev.siteUpdates || [])]
        }));

        setNewUpdateTitle('');
        setNewUpdateDesc('');
        setNewUpdateImageUrl('');
        setShowAddUpdateModal(false);
    };

    const handleAddDecisionFromStudio = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDecisionTitle.trim()) return;

        const newRecord: ProjectDecisionRecord = {
            id: `dec-${Date.now()}`,
            date: new Date().toISOString(),
            title: newDecisionTitle,
            description: newDecisionDesc,
            roomId: newDecisionRoom || 'General Scope',
            status: 'pending'
        };

        setProjectContext((prev: any) => ({
            ...prev,
            projectDecisions: [newRecord, ...(prev.projectDecisions || [])]
        }));

        setNewDecisionTitle('');
        setNewDecisionDesc('');
        setNewDecisionRoom('');
        setShowAddDecisionModal(false);
    };

    /**
     * A signature captured in the portal is written through the canonical
     * approval engine, which updates every field family the studio workspace
     * reads (executionSignoff, contractSignoff, engagement.status, lifecycle
     * gates, terms dockets). Without this the studio side would keep showing
     * the document as unsigned.
     */
    const handleSignDocComplete = (docket: DigitalSignatureDocket, type: 'terms' | 'contract' | 'handover') => {
        setProjectContext(buildSignoffPatch(type, docket, { surface: 'client_portal' }));

        const confirmations: Record<typeof type, string> = {
            terms: 'Terms of Engagement Docket signed and sealed. Your studio has been notified.',
            contract: 'Master Execution Agreement signed. Scope and BOQ are now locked.',
            handover: 'Handover & Acceptance Docket signed. Your warranty cover is now active.'
        };
        setSignSuccessMessage(confirmations[type]);

        setSigningDocType(null);
        setTimeout(() => setSignSuccessMessage(null), 8000);
    };

    // ── Contesting a record the studio entered on the client's behalf ────────
    // Manual override lets staff mark a client's agreement as signed. Without a
    // way for the client to say "that isn't right", the feature is an integrity
    // hole; with one, the record is stronger than a paper file.
    const [disputeTarget, setDisputeTarget] = useState<AgreementStatus | null>(null);
    const [disputeReason, setDisputeReason] = useState('');

    const submitDispute = () => {
        if (!disputeTarget || !disputeReason.trim()) return;
        setProjectContext(buildDisputePatch(
            disputeTarget.kind,
            disputeReason.trim(),
            context.clientName || 'Client'
        ));
        setDisputeTarget(null);
        setDisputeReason('');
        setSignSuccessMessage(
            'Thank you — your studio has been notified and will get back to you about this record.'
        );
        setTimeout(() => setSignSuccessMessage(null), 9000);
    };

    const handleSendMessageToStudio = (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientMessageText.trim()) return;

        setClientMessageSent(true);
        setTimeout(() => {
            setClientMessageText('');
            setClientMessageSent(false);
            setShowContactModal(false);
            alert('Your message has been dispatched directly to the Studio Project Manager!');
        }, 1200);
    };

    // External clients are locked out if D1 is unpaid. Studio owners can always view in-app in Studio Workspace mode.
    if (!isD1Paid && !isInternalStudioView) {
        return (
            <div className="w-full space-y-6 p-6">
                <LockedState 
                    title="Client Portal Locked" 
                    prerequisite="D1 Advance Payment" 
                    why="The Client Portal activates automatically once the initial design advance (D1) is logged as paid." 
                    actionLabel="Log Payment" 
                    onAction={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'payment-calc' }))}
                />
            </div>
        );
    }

    return (
        <div 
            className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans selection:bg-amber-100 selection:text-amber-900"
            style={{ 
                '--color-primary': primaryThemeColor,
                '--color-accent': settings?.accentColor || '#d97706'
            } as React.CSSProperties}
        >
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 bg-[#0066CC]/95 text-white backdrop-blur-xl flex flex-col shrink-0 sticky top-0 md:h-screen z-20 shadow-xl border-r border-white/20">
                <div className="p-6 border-b border-white/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {settings?.logoUrl ? (
                            <img src={settings.logoUrl} alt="Logo" className="w-9 h-9 object-contain shrink-0 rounded-lg bg-white/10 p-1" />
                        ) : (
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 bg-white/20 border border-white/30 shadow-inner">
                                {studioCompanyName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h1 className="font-bold text-white leading-tight text-sm tracking-tight">
                                {settings?.clientPortalConfig?.portalTitle || studioCompanyName}
                            </h1>
                            <p className="text-[10px] font-semibold text-sky-200 uppercase tracking-widest mt-0.5">Client Portal</p>
                        </div>
                    </div>
                    {onLogout && (
                        <button onClick={onLogout} title="Sign Out" className="md:hidden p-2 text-sky-200 hover:text-white">
                            <LogOut className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 p-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-visible scrollbar-none">
                    {[
                        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                        { id: 'approvals', label: 'Client Approvals', icon: ShieldCheck, badge: clientPendingCount },
                        { id: 'documents', label: 'Your Documents', icon: FileText, badge: documentsNeedingAttention },
                        { id: 'feed', label: 'Live Site Feed', icon: Activity, badge: liveFeed.length },
                        { id: 'roadmap', label: 'Roadmap & Progress', icon: MapIcon },
                        { id: 'designs', label: '3D Renders & Drawings', icon: ImageIcon, badge: designDocuments.length },
                        { id: 'materials', label: 'Material Selections', icon: Layers, badge: clientActionSummary.materialsPending.filter(m => m.owner === 'client').length },
                        { id: 'scope', label: 'Scope & BOQ', icon: GitMerge },
                        { id: 'financials', label: 'Financials & Invoices', icon: Wallet, badge: duePayments.length },
                    ].map((tab: any) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center justify-between px-3.5 py-3 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                                activeTab === tab.id 
                                    ? 'bg-white/20 text-white backdrop-blur-md border border-white/30 shadow-md shadow-sky-950/30 font-bold' 
                                    : 'text-sky-100 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-sky-200'}`} />
                                <span>{tab.label}</span>
                            </div>
                            {tab.badge !== undefined && tab.badge > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === tab.id 
                                        ? 'bg-white text-[#0066CC]' 
                                        : 'bg-white/20 text-white border border-white/30'
                                }`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Footer Bar */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-xs space-y-3">
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Client Login ID</span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(projectData.id);
                                    alert('Login ID copied to clipboard!');
                                }}
                                className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
                            >
                                <Copy className="w-3 h-3" />
                                Copy
                            </button>
                        </div>
                        <p className="font-mono text-amber-200 font-bold text-xs truncate">{projectData.id}</p>
                    </div>

                    <button 
                        onClick={() => setShowContactModal(true)}
                        className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
                    >
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                        Contact Studio Manager
                    </button>

                    {onLogout && (
                        <button 
                            onClick={onLogout} 
                            className="flex items-center justify-center gap-2 px-3 py-2 w-full rounded-xl font-bold text-xs text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors border border-transparent hover:border-rose-500/20 cursor-pointer"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Workspace Area */}
            <main className="flex-1 overflow-y-auto flex flex-col">
                {/* Studio Workspace Mirror Banner */}
                {isInternalStudioView && (
                    <div className="bg-[#0066CC]/10 backdrop-blur-md border-b border-[#0066CC]/20 px-6 py-3 text-slate-900 flex flex-col md:flex-row items-center justify-between gap-3 text-sm font-sans shadow-2xs">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0066CC]/90 text-white backdrop-blur-md border border-white/20 shadow-sm shadow-sky-600/20">
                                Studio Workspace View
                            </span>
                            <span className="font-semibold text-slate-800 text-xs">
                                Client Portal Live Mirror & Control Panel
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(projectData.id);
                                    alert(`Client Login ID (${projectData.id}) copied to clipboard!`);
                                }}
                                className="px-3 py-1.5 text-xs font-bold bg-white/90 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <Copy className="w-3.5 h-3.5 text-slate-600" />
                                Copy Login ID ({projectData.id})
                            </button>
                            <button
                                onClick={() => setShowAddUpdateModal(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-[#0066CC]/90 hover:bg-[#0055B3] text-white backdrop-blur-md border border-white/20 rounded-lg shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <PlusCircle className="w-3.5 h-3.5 text-sky-200" />
                                + Post Site Update
                            </button>
                            <button
                                onClick={() => setShowAddDecisionModal(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-[#0066CC]/80 hover:bg-[#0055B3] text-white backdrop-blur-md border border-white/20 rounded-lg shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <CheckSquare className="w-3.5 h-3.5 text-sky-200" />
                                + Request Decision
                            </button>
                        </div>
                    </div>
                )}

                {/* Top Header Bar */}
                <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-10 px-6 md:px-10 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{context.name || 'Interior Design Project'}</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Active Execution
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>Client: <strong className="text-slate-800">{context.clientName || 'Valued Client'}</strong></span>
                            <span>•</span>
                            <span>Project Code: <strong className="font-mono text-slate-800">{projectData.id}</strong></span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                        <button
                            onClick={() => setShowContactModal(true)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            <PhoneCall className="w-3.5 h-3.5 text-slate-600" />
                            Studio PM Support
                        </button>
                        <button
                            onClick={() => setShowBankDetailsModal(true)}
                            className="px-3 py-2 bg-[#FDFDFB] hover:bg-slate-50 text-slate-800 border border-slate-200/80 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                            <CreditCard className="w-3.5 h-3.5 text-[#C5A85C]" />
                            Bank Details & UPI
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8 flex-1">

                    {/* Tab Content Router */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* Success Notification Banner (e.g. after digital signing) */}
                                {signSuccessMessage && (
                                    <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-fade-in">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                            <p className="text-xs font-bold text-emerald-900">{signSuccessMessage}</p>
                                        </div>
                                        <button 
                                            onClick={() => setSignSuccessMessage(null)}
                                            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-1"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}

                                {/* Signature callouts — one per agreement the studio has actually
                                    released to the client. Documents still being prepared by the
                                    studio are deliberately NOT shown as a client task here. */}
                                {approvals.actionable.map((doc: AgreementStatus) => (
                                    <div
                                        key={`callout-${doc.kind}`}
                                        className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs animate-fade-in ${
                                            doc.isOverdue ? 'bg-rose-50 border-rose-300/80' : 'bg-amber-50 border-amber-300/80'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                                                doc.isOverdue ? 'bg-rose-200/80 text-rose-900' : 'bg-amber-200/80 text-amber-900'
                                            }`}>
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className={`text-sm font-bold ${doc.isOverdue ? 'text-rose-950' : 'text-amber-950'}`}>
                                                        Action required: {doc.title}
                                                    </h4>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white">
                                                        {doc.isOverdue ? 'Overdue' : 'Pending sign-off'}
                                                    </span>
                                                </div>
                                                <p className={`text-xs mt-0.5 ${doc.isOverdue ? 'text-rose-900/90' : 'text-amber-900/90'}`}>
                                                    {doc.purpose}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSigningDocType(doc.kind as AgreementKind)}
                                            className={`px-4 py-2 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                doc.isOverdue ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                                            }`}
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Review & sign
                                        </button>
                                    </div>
                                ))}

                                {/* Paperwork has fallen behind the site — shown regardless of stage. */}
                                {approvals.breaches.filter(b => !b.needsClientAction).length > 0 && (
                                    <div className="p-5 rounded-2xl bg-rose-50 border border-rose-300/80 flex items-start gap-3 shadow-2xs">
                                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-rose-950">
                                                Unsigned paperwork at Stage {lifecycleInfo.currentStageNumber}
                                            </h4>
                                            <p className="text-xs text-rose-900/90 mt-0.5 leading-relaxed">
                                                {approvals.breaches.filter(b => !b.needsClientAction).map(b => b.title).join(' and ')}{' '}
                                                should have been executed by now. Your studio is preparing the document — we will notify you the moment it is ready to sign.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 1. Refined Executive Header Banner */}
                                <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs relative overflow-hidden border-t-4 border-t-[#C5A85C]">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-900 border border-amber-200/80">
                                                    Executive Summary
                                                </span>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-xs font-semibold text-slate-500">
                                                    {studioCompanyName}
                                                </span>
                                            </div>
                                            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                                Welcome, {context.clientName || 'Valued Client'}
                                            </h3>
                                            <p className="text-slate-500 text-xs max-w-2xl">
                                                {settings?.clientPortalConfig?.introMessage ||
                                                  `Track real-time site execution, design sign-offs, and financial updates for ${context.name || 'your interior project'}.`}
                                            </p>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
                                            <div className="px-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-left">
                                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Phase</p>
                                                <p className="text-xs font-bold text-slate-800 capitalize mt-0.5">
                                                    Phase {lifecycleInfo.currentStageNumber} of 6: {lifecycleInfo.currentStageName}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowContactModal(true)}
                                                className="px-4 py-2.5 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                                            >
                                                <MessageSquare className="w-3.5 h-3.5 text-sky-200" />
                                                Contact PM
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Three High-Impact Executive Key Vitals */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    {/* Vital 1: Overall Progress */}
                                    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Activity className="w-3.5 h-3.5 text-[#C5A85C]" />
                                                Lifecycle Progress
                                            </span>
                                            <span className="text-xs font-extrabold text-[#C5A85C] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                                                {lifecycleInfo.overallProgressPercent}%
                                            </span>
                                        </div>
                                        <div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-[#C5A85C] to-amber-500 rounded-full transition-all duration-700" 
                                                    style={{ width: `${lifecycleInfo.overallProgressPercent}%` }}
                                                />
                                            </div>
                                            <p className="text-[11px] text-slate-500 flex justify-between">
                                                <span>Stage {lifecycleInfo.currentStageNumber}: {lifecycleInfo.currentStageName}</span>
                                                <button onClick={() => setActiveTab('roadmap')} className="text-slate-800 font-bold hover:underline cursor-pointer">
                                                    Roadmap →
                                                </button>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Vital 2: Financial Snapshot */}
                                    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                                                Financial Summary
                                            </span>
                                            <span className="text-xs font-extrabold text-slate-900">
                                                {formatINR(currentProjectValue)}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center text-[11px] mb-1 font-semibold text-slate-600">
                                                <span>Cleared: <strong className="text-emerald-700">{formatINR(totalPaid)}</strong></span>
                                                <span>Due: <strong className="text-slate-900">{formatINR(balanceDue)}</strong></span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${paidPercentage}%` }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Vital 3: Pending Approvals & Actions */}
                                    <div className={`rounded-2xl p-5 border shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between space-y-3 ${
                                        clientPendingCount > 0
                                            ? 'bg-amber-50/50 border-amber-200/90'
                                            : 'bg-white border-slate-200/80'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                                                Client Approvals
                                            </span>
                                            {clientPendingCount > 0 ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                                                    {clientPendingCount} Pending
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                    All Clear ✓
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-600 font-medium">
                                                {clientPendingCount > 0
                                                    ? [
                                                        clientActionSummary.agreementsPending.filter(a => a.owner === 'client').length > 0 && `${clientActionSummary.agreementsPending.filter(a => a.owner === 'client').length} agreement(s) to sign`,
                                                        clientActionSummary.paymentsPending.length > 0 && `${clientActionSummary.paymentsPending.length} invoice(s) due`,
                                                        clientActionSummary.variationsPending.length > 0 && `${clientActionSummary.variationsPending.length} variation(s)`,
                                                        clientActionSummary.decisionsPending.length > 0 && `${clientActionSummary.decisionsPending.length} decision(s)`,
                                                        clientActionSummary.materialsPending.filter(a => a.owner === 'client').length > 0 && `${clientActionSummary.materialsPending.filter(a => a.owner === 'client').length} finish(es)`
                                                      ].filter(Boolean).join(' • ')
                                                    : clientActionSummary.studioActions.length > 0
                                                        ? `Nothing needs you. ${clientActionSummary.studioActions.length} item(s) are with your studio.`
                                                        : 'No pending sign-offs or approvals required at this time.'}
                                            </p>
                                            <div className="mt-2 text-right">
                                                <button 
                                                    onClick={() => setActiveTab('approvals')}
                                                    className="text-xs font-bold text-slate-800 hover:text-black flex items-center justify-end gap-1 cursor-pointer"
                                                >
                                                    {clientPendingCount > 0 ? 'Review Action Items' : 'View Approval History'} <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Main Dashboard 2-Column Split */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    
                                    {/* Left Main Column (7/12) */}
                                    <div className="lg:col-span-7 space-y-6">
                                        
                                        {/* Action Required — driven entirely by the client action engine.
                                            Only items genuinely in the client's court are listed here. */}
                                        {clientPendingCount > 0 && (
                                            <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/90 rounded-2xl p-5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                                                            Waiting on you ({clientPendingCount})
                                                        </h4>
                                                    </div>
                                                    <button
                                                        onClick={() => setActiveTab('approvals')}
                                                        className="text-[11px] font-bold text-amber-900 hover:underline cursor-pointer"
                                                    >
                                                        Approvals Hub &rarr;
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                    {clientActionSummary.clientActions.slice(0, 6).map((item) => {
                                                        const tone = item.category === 'payment'
                                                            ? { border: 'border-rose-200 hover:border-rose-300', dot: 'bg-rose-500', text: 'text-rose-900', chev: 'text-rose-400' }
                                                            : item.category === 'agreement'
                                                                ? { border: 'border-amber-300 hover:border-amber-400', dot: 'bg-amber-500', text: 'text-amber-950', chev: 'text-amber-600' }
                                                                : { border: 'border-slate-200 hover:border-slate-300', dot: 'bg-slate-400', text: 'text-slate-900', chev: 'text-slate-400' };
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => {
                                                                    if (item.actionType === 'sign_terms') setSigningDocType('terms');
                                                                    else if (item.actionType === 'sign_contract') setSigningDocType('contract');
                                                                    else if (item.actionType === 'sign_handover') setSigningDocType('handover');
                                                                    else setActiveTab(item.targetTab as any);
                                                                }}
                                                                className={`p-3 bg-white border rounded-xl text-left transition-all cursor-pointer flex items-center justify-between shadow-2xs group ${tone.border}`}
                                                            >
                                                                <div className="space-y-0.5 pr-2 min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot} ${item.severity === 'critical' ? 'animate-pulse' : ''}`} />
                                                                        <p className={`text-xs font-bold truncate ${tone.text}`}>{item.title}</p>
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-500 line-clamp-1">
                                                                        {item.amount ? `${formatINR(item.amount)} • ` : ''}{item.statusBadge}
                                                                    </p>
                                                                </div>
                                                                <ChevronRight className={`w-4 h-4 group-hover:translate-x-0.5 transition-transform shrink-0 ${tone.chev}`} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {clientActionSummary.clientActions.length > 6 && (
                                                    <button
                                                        onClick={() => setActiveTab('approvals')}
                                                        className="text-[11px] font-bold text-amber-900 hover:underline cursor-pointer"
                                                    >
                                                        + {clientActionSummary.clientActions.length - 6} more
                                                    </button>
                                                )}
                                            </div>
                                        )}


                                        {/* Dynamic 6-Phase Project Lifecycle Pipeline */}
                                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <MapIcon className="w-4 h-4 text-[#C5A85C]" />
                                                    <div>
                                                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                                                            Project Lifecycle Pipeline
                                                        </h4>
                                                        <p className="text-[10px] text-slate-400">
                                                            Derived from signed documents, cleared payments and site records
                                                        </p>
                                                    </div>
                                                </div>
                                                <button onClick={() => setActiveTab('roadmap')} className="text-xs font-bold text-[#0066CC] hover:underline cursor-pointer">
                                                    Full Interactive Roadmap &rarr;
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                                                {lifecycleInfo.stages.map((stage) => (
                                                    <div 
                                                        key={stage.id} 
                                                        title={stage.gateNote || stage.subtitle}
                                                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all ${
                                                            stage.gateBreached
                                                                ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                                                                : stage.status === 'active' 
                                                                    ? 'bg-amber-50/70 border-amber-300 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-300/50' 
                                                                    : stage.status === 'completed'
                                                                        ? 'bg-emerald-50/40 border-emerald-200 text-emerald-900'
                                                                        : 'bg-slate-50/60 border-slate-200/60 text-slate-400'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-mono font-bold opacity-75">
                                                                PHASE 0{stage.stageNumber}
                                                            </span>
                                                            {stage.gateBreached ? (
                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded">
                                                                    <AlertCircle className="w-3 h-3" /> Gate open
                                                                </span>
                                                            ) : stage.status === 'completed' && (
                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                                                    <CheckCircle2 className="w-3 h-3" /> Done
                                                                </span>
                                                            )}
                                                            {stage.status === 'active' && (
                                                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded animate-pulse">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> Current
                                                                </span>
                                                            )}
                                                            {stage.status === 'pending' && (
                                                                <span className="text-[10px] font-medium text-slate-400">
                                                                    Upcoming
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <p className={`text-xs font-bold ${
                                                                stage.status === 'active' ? 'text-slate-900' : stage.status === 'completed' ? 'text-slate-800' : 'text-slate-500'
                                                            }`}>
                                                                {stage.title}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5 font-normal">
                                                                {stage.clientDeliverable}
                                                            </p>
                                                        </div>

                                                        <div className="pt-1.5 border-t border-slate-100/80 text-[10px] flex items-center justify-between">
                                                            <span className={`font-medium truncate pr-1 ${stage.gateBreached ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                {stage.gateBreached ? 'Sign-off outstanding' : stage.gateRequirement}
                                                            </span>
                                                            <span className="font-bold text-slate-700 shrink-0">
                                                                {stage.progressPercent}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Recent Site Activity Highlight Card */}
                                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wide">
                                                    <Camera className="w-3.5 h-3.5 text-[#C5A85C]" />
                                                    Latest Site Progress Highlight
                                                </h4>
                                                <button onClick={() => setActiveTab('feed')} className="text-xs font-bold text-[#0066CC] hover:underline flex items-center gap-1 cursor-pointer">
                                                    View Live Feed ({liveFeed.length}) &rarr;
                                                </button>
                                            </div>

                                            {liveFeed.filter(item => item.type === 'site_update').length > 0 ? (
                                                (() => {
                                                    const latestUpdate = liveFeed.filter(item => item.type === 'site_update')[0];
                                                    return (
                                                        <div className="p-5 space-y-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <h5 className="font-bold text-slate-900 text-sm">{latestUpdate.title}</h5>
                                                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                                                        {latestUpdate.date?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • Posted by {latestUpdate.author || 'Site Operations'}
                                                                    </p>
                                                                </div>
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/60">
                                                                    Site Log
                                                                </span>
                                                            </div>

                                                            {latestUpdate.images && latestUpdate.images.length > 0 && (
                                                                <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden max-h-48">
                                                                    {latestUpdate.images.slice(0, 2).map((imgUrl: string, imgIdx: number) => (
                                                                        <img 
                                                                            key={imgIdx} 
                                                                            src={imgUrl} 
                                                                            alt="Site Photo" 
                                                                            onClick={() => setLightboxImage({ url: imgUrl, title: latestUpdate.title, subtitle: latestUpdate.description })}
                                                                            className="w-full h-40 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity" 
                                                                        />
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {latestUpdate.description && (
                                                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                                    "{latestUpdate.description}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })()
                                            ) : (
                                                <div className="p-8 text-center text-slate-400 text-xs space-y-1.5">
                                                    <Camera className="w-6 h-6 mx-auto text-slate-300" />
                                                    <p className="font-bold text-slate-600">No site photo updates posted yet.</p>
                                                    <p>Site inspection reports and execution logs will appear here automatically.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Sidebar Column (5/12) */}
                                    <div className="lg:col-span-5 space-y-6">
                                        
                                        {/* Upcoming Studio Milestones Card */}
                                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wide">
                                                    <Clock className="w-3.5 h-3.5 text-[#0066CC]" />
                                                    Upcoming Studio Steps
                                                </h4>
                                                <span className="text-[10px] font-bold text-slate-400">Phase {lifecycleInfo.currentStageNumber}</span>
                                            </div>

                                            <div className="space-y-3">
                                                {upcomingSteps.map((step) => (
                                                    <div
                                                        key={step.id}
                                                        className={`p-3 rounded-xl border space-y-1 ${
                                                            step.blocked
                                                                ? 'bg-amber-50/60 border-amber-200'
                                                                : 'bg-slate-50 border-slate-100'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] font-bold text-[#0066CC] uppercase tracking-wider truncate">{step.responsible}</span>
                                                            <span className="text-[10px] font-medium text-slate-400 shrink-0">{step.expectedTimeframe}</span>
                                                        </div>
                                                        <h5 className="font-bold text-slate-900 text-xs">{step.title}</h5>
                                                        <p className="text-[11px] text-slate-500">{step.description}</p>
                                                        {step.blocked && step.blockedBy && (
                                                            <p className="text-[10px] font-bold text-amber-800 flex items-center gap-1 pt-1">
                                                                <Lock className="w-3 h-3 shrink-0" />
                                                                Blocked: {step.blockedBy}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Studio Contact & Project Info */}
                                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
                                            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                                                {settings?.logoUrl ? (
                                                    <img src={settings.logoUrl} alt="Studio Logo" className="w-10 h-10 object-contain rounded-xl bg-slate-50 p-1 border border-slate-200" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm shadow-inner">
                                                        {studioCompanyName.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 className="font-bold text-slate-900 text-sm">{studioCompanyName}</h4>
                                                    <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Project Management Support</p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 text-xs">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-slate-400 font-semibold">Property Address:</span>
                                                    <span className="font-medium text-slate-800 text-right max-w-[180px] truncate">
                                                        {(context as any).clientAddress || (context as any).address || 'Address On File'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                                    <span className="text-slate-400 font-semibold">Primary Client:</span>
                                                    <span className="font-bold text-slate-800">{context.clientName || 'Valued Client'}</span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                                    <span className="text-slate-400 font-semibold">Project Code:</span>
                                                    <span className="font-mono font-bold text-slate-800">{projectData.id}</span>
                                                </div>
                                            </div>

                                            <div className="pt-2 grid grid-cols-2 gap-2">
                                                <button 
                                                    onClick={() => setShowContactModal(true)}
                                                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <PhoneCall className="w-3.5 h-3.5 text-slate-600" />
                                                    Call Studio
                                                </button>
                                                <button 
                                                    onClick={() => setShowBankDetailsModal(true)}
                                                    className="py-2 px-3 bg-[#FDFDFB] hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <CreditCard className="w-3.5 h-3.5 text-[#C5A85C]" />
                                                    Bank & UPI
                                                </button>
                                            </div>
                                        </div>

                                        {/* Filtered Active Room Progress */}
                                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wide">
                                                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                                                    Active Space Breakdown
                                                </h4>
                                                <span className="text-[10px] text-slate-400 font-bold">{roomProgressData.length} Rooms</span>
                                            </div>

                                            <div className="space-y-3">
                                                {roomProgressData.filter(r => r.progress > 0).length > 0 ? (
                                                    roomProgressData.filter(r => r.progress > 0).map((room, rIdx) => (
                                                        <div key={room.id || rIdx} className="space-y-1">
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="font-bold text-slate-800">{room.name}</span>
                                                                <span className="font-bold text-amber-700">{room.progress}%</span>
                                                            </div>
                                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${room.progress}%` }} />
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center py-4 text-slate-400 text-xs space-y-1">
                                                        <p className="font-medium text-slate-600">Site Preparation Complete</p>
                                                        <p>Active room execution stages will display here as work commences on site.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {/* Tab 2: LIVE SITE FEED */}
                        {activeTab === 'feed' && (
                            <motion.div
                                key="feed"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                                    <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-none">
                                        {[
                                            { id: 'all', label: 'All Updates' },
                                            { id: 'site', label: 'Site Photos' },
                                            { id: 'meetings', label: 'Minutes of Meeting (MoM)' },
                                            { id: 'variations', label: 'Variations' },
                                            { id: 'payments', label: 'Invoices' },
                                            { id: 'decisions', label: 'Decisions' },
                                        ].map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setFeedCategoryFilter(f.id as any)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    feedCategoryFilter === f.id 
                                                        ? 'bg-slate-900 text-white shadow-xs' 
                                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                }`}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative w-full sm:w-64">
                                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={feedSearchQuery}
                                            onChange={(e) => setFeedSearchQuery(e.target.value)}
                                            placeholder="Search updates, MoMs, site notes..."
                                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {filteredLiveFeed.length === 0 ? (
                                        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 text-xs border border-slate-200/80 space-y-2">
                                            <FileText className="w-8 h-8 mx-auto text-slate-300" />
                                            <p className="font-bold text-slate-600">No feed items match your filter.</p>
                                            <p>Updates, site photos, and Minutes of Meeting (MoM) will appear here automatically.</p>
                                        </div>
                                    ) : (
                                        filteredLiveFeed.map(item => (
                                            <div key={item.id} className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                                                            item.type === 'site_update' ? 'bg-amber-50 text-amber-800 border border-amber-200/80' :
                                                            item.type === 'payment' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80' :
                                                            item.type === 'project_update' ? 'bg-sky-50 text-[#0066CC] border border-sky-200/80' :
                                                            item.type === 'meeting' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200/80' :
                                                            'bg-amber-50 text-amber-800 border border-amber-200/80'
                                                        }`}>
                                                            {item.type === 'site_update' ? <Camera className="w-5 h-5 text-amber-600" /> :
                                                             item.type === 'payment' ? <Wallet className="w-5 h-5 text-emerald-600" /> :
                                                             item.type === 'project_update' ? <GitMerge className="w-5 h-5 text-[#0066CC]" /> :
                                                             item.type === 'meeting' ? <FileText className="w-5 h-5 text-indigo-600" /> :
                                                             <ShieldCheck className="w-5 h-5 text-amber-600" />}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-900 text-base">{item.title}</h4>
                                                            <p className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                                <span>{item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                                {item.author && <span>• {formatCleanAuthor(item.author)}</span>}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                                        item.type === 'payment' ? 'bg-emerald-100 text-emerald-800' :
                                                        item.type === 'site_update' ? 'bg-amber-100 text-amber-800' :
                                                        item.type === 'meeting' ? (
                                                            item.isAcknowledged 
                                                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                                : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                                        ) :
                                                        'bg-sky-100 text-sky-800'
                                                    }`}>
                                                        {item.type === 'meeting' ? (
                                                            item.isAcknowledged 
                                                                ? '✓ MOM ACKNOWLEDGED' 
                                                                : (item.momRef ? `MOM CREATED • ${item.momRef}` : 'MOM CREATED')
                                                        ) : item.type.replace('_', ' ').toUpperCase()}
                                                    </span>
                                                </div>

                                                {/* Meeting Attendees */}
                                                {item.type === 'meeting' && item.attendees && item.attendees.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                                                            <Users className="w-3 h-3 text-slate-400" />
                                                            Attendees:
                                                        </span>
                                                        {item.attendees.slice(0, 6).map((att: any, attIdx: number) => {
                                                            const name = typeof att === 'string' ? att : (att.name || att.email || 'Participant');
                                                            return (
                                                                <span key={attIdx} className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200/60">
                                                                    {name}
                                                                </span>
                                                            );
                                                        })}
                                                        {item.attendees.length > 6 && (
                                                            <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                                                                +{item.attendees.length - 6} more
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Meeting Content: Executive Summary Block vs Standard Description */}
                                                {item.type === 'meeting' ? (
                                                    <div className="space-y-4 pt-1">
                                                        {/* Executive Summary Container */}
                                                        <div className="bg-slate-50/90 rounded-2xl p-4.5 border border-slate-200/80 space-y-3 shadow-2xs">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                                                                        <Sparkle className="w-3.5 h-3.5" />
                                                                    </div>
                                                                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                                                        Executive Summary
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200/80 shadow-2xs">
                                                                    Discussion Digest
                                                                </span>
                                                            </div>

                                                            <p className="text-slate-700 text-xs leading-relaxed font-medium">
                                                                {item.executiveSummary || item.description}
                                                            </p>

                                                            {/* Highlights & Scope Considerations */}
                                                            {item.highlights && item.highlights.length > 0 && (
                                                                <div className="pt-2 border-t border-slate-200/60 space-y-2">
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                                                        Key Discussion & Scope Highlights
                                                                    </span>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                        {item.highlights.map((hl: string, hIdx: number) => (
                                                                            <div key={hIdx} className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/70 flex items-start gap-2 shadow-2xs">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                                                                <span className="leading-snug font-medium">{hl}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Concise MoM Highlights / Metrics Chips */}
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {item.decisions && item.decisions.length > 0 && (
                                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200/70">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                                    <span>{item.decisions.length} Confirmed Decision{item.decisions.length > 1 ? 's' : ''}</span>
                                                                </div>
                                                            )}
                                                            {item.actionItems && item.actionItems.length > 0 && (
                                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-900 text-xs font-bold border border-indigo-200/70">
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                                    <span>{item.actionItems.length} Action Item{item.actionItems.length > 1 ? 's' : ''}</span>
                                                                </div>
                                                            )}
                                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                                <span>Official Studio Record</span>
                                                            </div>
                                                        </div>

                                                        {/* Attached Official MoM Document Card */}
                                                        <div className="bg-gradient-to-r from-indigo-50/80 via-slate-50 to-indigo-50/50 rounded-2xl p-4 border border-indigo-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                                                            <div className="flex items-center gap-3.5">
                                                                <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                                                    <FileText className="w-5 h-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-xs font-black text-indigo-950">
                                                                            Minutes of Meeting Document ({item.momRef || 'Official MoM'})
                                                                        </span>
                                                                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200/80 flex items-center gap-1">
                                                                            <Paperclip className="w-3 h-3 text-indigo-600" />
                                                                            MoM Attached
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-medium">
                                                                        <span>{item.isAcknowledged ? '✓ Digitally Signed & Locked' : 'Pending Client Review & Sign-Off'}</span>
                                                                        <span>•</span>
                                                                        <span>{item.attendees?.length || 0} Attendees Recorded</span>
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <button
                                                                onClick={() => setSelectedMomForViewer(item.momData || item.data || item)}
                                                                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0"
                                                            >
                                                                <FileText className="w-4 h-4 text-indigo-200" />
                                                                <span>View Official MoM ({item.momRef || 'Document'})</span>
                                                                <ChevronRight className="w-3.5 h-3.5 text-indigo-200" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-slate-700 text-xs leading-relaxed font-medium">{item.description}</p>
                                                )}

                                                {/* Site Photos Gallery */}
                                                {item.images && item.images.length > 0 && (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                                                        {item.images.map((img: string, idx: number) => (
                                                            <div 
                                                                key={idx}
                                                                onClick={() => setLightboxImage({ url: img, title: item.title, subtitle: item.description })}
                                                                className="group relative aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer"
                                                            >
                                                                <img src={img} alt="Site Photo" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                    <Maximize2 className="w-5 h-5" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Action Buttons for Decisions/Variations */}
                                                {item.type === 'decision' && item.status !== 'confirmed' && (
                                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleApproveDecisionOption(item.data.id, 'Option Approved')}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Confirm Decision
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 3: ROADMAP & TIMELINE */}
                        {activeTab === 'roadmap' && (
                            <motion.div
                                key="roadmap"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* Header and View Switcher */}
                                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                                <MapIcon className="w-5 h-5 text-[#0066CC]" />
                                                Project Programme & Execution Timeline
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Track live progress across project phases, scheduled trades, and key milestone handovers.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            {/* View Switcher */}
                                            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80">
                                                <button
                                                    onClick={() => setRoadmapViewMode('gantt')}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                        roadmapViewMode === 'gantt'
                                                            ? 'bg-white text-slate-900 shadow-2xs'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <Calendar className="w-3.5 h-3.5 text-[#0066CC]" />
                                                    Gantt Timeline
                                                </button>
                                                <button
                                                    onClick={() => setRoadmapViewMode('milestones')}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                        roadmapViewMode === 'milestones'
                                                            ? 'bg-white text-slate-900 shadow-2xs'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                    Milestone Stages
                                                </button>
                                            </div>

                                        </div>
                                    </div>
                                </div>

                                {/* Main Timeline Display based on View Mode */}
                                {roadmapViewMode === 'gantt' ? (
                                    <div className="space-y-4">
                                        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-xs font-bold text-slate-800">Live Project Schedule</span>
                                                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                                                        · Click any bar to view phase details & duration
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px]">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                        <span className="text-slate-600 font-medium">Today Line</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                                        <span className="text-slate-600 font-medium">Target Handover</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Client-Safe ReadOnly Schedule Gantt Component */}
                                            <ScheduleGantt 
                                                schedule={clientSchedule} 
                                                readOnly={true} 
                                                projectContext={projectData.context} 
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                                Project Lifecycle Gates & Stages
                                            </h4>
                                            <span className="text-xs font-bold text-[#C5A85C]">
                                                {lifecycleInfo.overallProgressPercent}% Complete Overall
                                            </span>
                                        </div>
                                        <div className="space-y-3 pt-2">
                                            {lifecycleInfo.stages.map(step => (
                                                <div key={step.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                                                    step.gateBreached ? 'border-rose-200 bg-rose-50/40' :
                                                    step.status === 'completed' ? 'border-emerald-100 bg-emerald-50/30' :
                                                    step.status === 'active' ? 'border-amber-300 bg-amber-50/50 shadow-2xs ring-1 ring-amber-300/40' :
                                                    'border-slate-100 bg-slate-50/50'
                                                }`}>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${
                                                        step.gateBreached ? 'bg-rose-500 text-white' :
                                                        step.status === 'completed' ? 'bg-emerald-600 text-white' :
                                                        step.status === 'active' ? 'bg-amber-500 text-slate-950 font-black' :
                                                        'bg-slate-200 text-slate-500'
                                                    }`}>
                                                        {step.gateBreached
                                                            ? <AlertCircle className="w-4 h-4" />
                                                            : step.status === 'completed' ? <Check className="w-4 h-4" /> : step.stageNumber}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h5 className="font-bold text-slate-900 text-sm">{step.title}</h5>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {step.status === 'active' && (
                                                                    <span className="text-[10px] font-bold text-slate-500">{step.progressPercent}%</span>
                                                                )}
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    step.gateBreached ? 'bg-rose-100 text-rose-800' :
                                                                    step.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                                                    step.status === 'active' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                                                                    'bg-slate-200 text-slate-600'
                                                                }`}>
                                                                    {step.gateBreached ? 'GATE OPEN' : step.status === 'active' ? 'CURRENT PHASE' : step.status.toUpperCase()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-slate-600 mt-1">{step.description}</p>

                                                        {step.gateNote && (
                                                            <p className={`text-[11px] font-semibold mt-2 flex items-start gap-1.5 ${
                                                                step.gateBreached ? 'text-rose-700' : 'text-amber-800'
                                                            }`}>
                                                                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                                                <span>{step.gateNote}</span>
                                                            </p>
                                                        )}

                                                        {step.status === 'active' && step.evidence.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {step.evidence.slice(-4).map((ev, i) => (
                                                                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/80 text-slate-600 border border-slate-200/70">
                                                                        {ev}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="mt-2 pt-2 border-t border-slate-100/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                            <span className="text-slate-500">
                                                                <strong>Deliverable:</strong> {step.clientDeliverable}
                                                            </span>
                                                            <span className="text-slate-700 font-semibold bg-white/80 px-2 py-0.5 rounded border border-slate-200/60">
                                                                Gate: {step.gateRequirement}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Studio Timeline Commitments & Client Checkpoints */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                                            <Clock className="w-4 h-4 text-[#0066CC]" />
                                            Working Days Commitment
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">
                                            All durations are tracked in working days (excluding non-working days) to provide accurate on-site forecasts.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                                            <Sparkle className="w-4 h-4 text-amber-600" />
                                            Prompt Selections
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">
                                            Timely approvals on 3D views and laminate/veneer swatches ensure materials arrive before each trade begins.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                            Quality Handover Gate
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">
                                            A formal snag walkthrough ensures every hinge, light fitting, and polish coat meets studio standards before handover.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 4: 3D RENDERS & DRAWINGS */}
                        {activeTab === 'designs' && (
                            <motion.div
                                key="designs"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-6">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                                        <div>
                                            <h3 className="font-black text-slate-900 text-xl tracking-tight flex items-center gap-2.5">
                                                <ImageIcon className="w-5 h-5 text-amber-600" />
                                                Approved 3D Visualisations & Technical Drawings
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                                                High-resolution 3D perspectives, GFC working drawings, and approved 2D layout sheets shared by your design team.
                                            </p>
                                        </div>

                                        {/* Filters */}
                                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                            <select
                                                value={designTypeFilter}
                                                onChange={(e) => setDesignTypeFilter(e.target.value)}
                                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-hidden"
                                            >
                                                <option value="all">All Deliverables</option>
                                                <option value="3d_render">3D Renders</option>
                                                <option value="gfc_drawing">GFC Drawings</option>
                                                <option value="layout">2D Layouts</option>
                                                <option value="moodboard">Moodboards</option>
                                            </select>

                                            <select
                                                value={designRoomFilter}
                                                onChange={(e) => setDesignRoomFilter(e.target.value)}
                                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-hidden"
                                            >
                                                <option value="all">All Rooms</option>
                                                {Array.from(new Set(designDocuments.map((d: any) => d.roomName).filter(Boolean))).map((r: any) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {(() => {
                                        const filteredDocs = designDocuments.filter((doc: any) => {
                                            if (designTypeFilter !== 'all') {
                                                const dt = doc.docType || '3d_render';
                                                if (dt !== designTypeFilter) return false;
                                            }
                                            if (designRoomFilter !== 'all' && doc.roomName !== designRoomFilter) {
                                                return false;
                                            }
                                            return true;
                                        });

                                        if (filteredDocs.length === 0) {
                                            return (
                                                <div className="p-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-3">
                                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                                                        <ImageIcon className="w-6 h-6" />
                                                    </div>
                                                    <p className="font-bold text-slate-700 text-sm">No deliverables matching your filter.</p>
                                                    <p className="text-slate-400">Design renders and technical drawings uploaded by the studio will appear here.</p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-5">
                                                {filteredDocs.map((doc: any) => {
                                                    const isImg = doc.thumbnailUrl || (doc.url && doc.url.match(/\.(jpeg|jpg|png|webp|avif)/i));
                                                    const docType = doc.docType || '3d_render';

                                                    return (
                                                        <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden group shadow-2xs hover:shadow-md transition-all flex flex-col">
                                                            <div 
                                                                onClick={() => {
                                                                    if (isImg) {
                                                                        setLightboxImage({ url: doc.thumbnailUrl || doc.url, title: doc.title, subtitle: doc.roomName });
                                                                    } else {
                                                                        window.open(doc.url, '_blank');
                                                                    }
                                                                }}
                                                                className="aspect-16/10 bg-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
                                                            >
                                                                {isImg ? (
                                                                    <img 
                                                                        src={doc.thumbnailUrl || doc.url} 
                                                                        alt={doc.title} 
                                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                                                    />
                                                                ) : (
                                                                    <div className="flex flex-col items-center justify-center p-6 text-center">
                                                                        <FileText className="w-10 h-10 text-slate-400 mb-2" />
                                                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Technical Document</span>
                                                                    </div>
                                                                )}
                                                                
                                                                <span className={`absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-xs ${
                                                                    docType === '3d_render' ? 'bg-amber-500 text-slate-950' :
                                                                    docType === 'gfc_drawing' ? 'bg-blue-600 text-white' :
                                                                    docType === 'layout' ? 'bg-indigo-600 text-white' :
                                                                    'bg-slate-800 text-white'
                                                                }`}>
                                                                    {docType.replace('_', ' ')}
                                                                </span>

                                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                    <div className="bg-black/60 backdrop-blur-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold">
                                                                        <Eye className="w-4 h-4" /> Preview
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="p-4 flex flex-col justify-between flex-grow space-y-3">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                                                                            {doc.roomName || 'Overall'}
                                                                        </span>
                                                                    </div>
                                                                    <h5 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2" title={doc.title}>
                                                                        {doc.title}
                                                                    </h5>
                                                                </div>

                                                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                                                    <a 
                                                                        href={doc.url} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        className="inline-flex items-center gap-1 text-xs font-bold text-[#0066CC] hover:text-[#0055B3] transition-colors"
                                                                    >
                                                                        Open Full Sheet <ExternalLink className="w-3.5 h-3.5" />
                                                                    </a>
                                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                                        {doc.addedAt ? new Date(doc.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 5: CLIENT APPROVALS & SIGN-OFFS HUB */}
                        {(activeTab === 'approvals' || activeTab === 'decisions') && (
                            <motion.div
                                key="approvals"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* ============ HEADER ============ */}
                                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-5">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#0066CC]/10 text-[#0055B3] border border-[#0066CC]/20">
                                                    Stage {lifecycleInfo.currentStageNumber} of 6
                                                </span>
                                                <span className="text-xs font-semibold text-slate-500">{lifecycleInfo.currentStageName}</span>
                                            </div>
                                            <h3 className="font-black text-slate-900 text-xl tracking-tight flex items-center gap-2.5">
                                                <ShieldCheck className="w-5 h-5 text-amber-600" />
                                                Approvals & Sign-off Centre
                                            </h3>
                                            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                                                {lifecycleInfo.headline} Everything below is derived live from your project record — nothing here is a placeholder.
                                            </p>
                                        </div>

                                        <div className={`px-4 py-3 rounded-2xl border text-center shrink-0 min-w-[150px] ${
                                            clientPendingCount > 0
                                                ? 'bg-amber-50 border-amber-200'
                                                : 'bg-emerald-50 border-emerald-200'
                                        }`}>
                                            <p className={`text-2xl font-black leading-none ${clientPendingCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                {clientPendingCount}
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                                                {clientPendingCount === 1 ? 'Item needs you' : 'Items need you'}
                                            </p>
                                            {clientActionSummary.studioActions.length > 0 && (
                                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                                    {clientActionSummary.studioActions.length} with the studio
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Gate breach warning — paperwork is behind the site */}
                                    {approvals.breaches.length > 0 && (
                                        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-rose-950">
                                                    Paperwork is behind the project stage
                                                </p>
                                                <p className="text-[11px] text-rose-900/90 leading-relaxed">
                                                    Your project has reached <strong>Stage {lifecycleInfo.currentStageNumber} — {lifecycleInfo.currentStageName}</strong>, but{' '}
                                                    {approvals.breaches.map(b => b.title).join(' and ')}{' '}
                                                    {approvals.breaches.length === 1 ? 'has' : 'have'} not been signed. Please complete{' '}
                                                    {approvals.breaches.length === 1 ? 'it' : 'them'} to keep your cover and warranty terms enforceable.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Sub-filters */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {([
                                            { id: 'all', label: 'Everything', count: clientActionSummary.allActions.length, tone: 'bg-slate-900 text-white' },
                                            { id: 'agreements', label: 'Agreements', count: clientActionSummary.agreementsPending.length, tone: 'bg-amber-600 text-white', icon: FileText },
                                            { id: 'payments', label: 'Invoices', count: clientActionSummary.paymentsPending.length, tone: 'bg-rose-600 text-white', icon: Wallet },
                                            { id: 'variations', label: 'Variations', count: clientActionSummary.variationsPending.length, tone: 'bg-orange-600 text-white', icon: FileEdit },
                                            { id: 'decisions', label: 'Decisions', count: clientActionSummary.decisionsPending.length, tone: 'bg-purple-600 text-white', icon: CheckSquare },
                                            { id: 'materials', label: 'Finishes', count: clientActionSummary.materialsPending.length, tone: 'bg-[#0066CC] text-white', icon: Layers },
                                        ] as any[]).map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setApprovalsFilter(f.id)}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    approvalsFilter === f.id
                                                        ? `${f.tone} shadow-xs`
                                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                                                }`}
                                            >
                                                {f.icon && <f.icon className="w-3 h-3" />}
                                                {f.label} ({f.count})
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ============ YOUR TURN ============ */}
                                {(() => {
                                    const visible = clientActionSummary.clientActions.filter(a =>
                                        approvalsFilter === 'all' ||
                                        (approvalsFilter === 'agreements' && a.category === 'agreement') ||
                                        (approvalsFilter === 'payments' && a.category === 'payment') ||
                                        (approvalsFilter === 'materials' && a.category === 'material') ||
                                        (approvalsFilter === 'decisions' && a.category === 'decision') ||
                                        (approvalsFilter === 'variations' && a.category === 'variation')
                                    );

                                    const runAction = (item: ClientActionItem) => {
                                        switch (item.actionType) {
                                            case 'sign_terms': setSigningDocType('terms'); break;
                                            case 'sign_contract': setSigningDocType('contract'); break;
                                            case 'sign_handover': setSigningDocType('handover'); break;
                                            case 'pay_milestone': setActiveTab('financials'); break;
                                            case 'approve_material':
                                                handleConfirmMaterialSelection(item.actionPayload?.id);
                                                setSignSuccessMessage(`Finish confirmed: ${item.actionPayload?.itemName || item.title}`);
                                                setTimeout(() => setSignSuccessMessage(null), 6000);
                                                break;
                                            case 'confirm_decision':
                                                handleApproveDecisionOption(item.actionPayload?.id, 'Confirmed by client');
                                                setSignSuccessMessage(`Decision confirmed: ${item.title}`);
                                                setTimeout(() => setSignSuccessMessage(null), 6000);
                                                break;
                                            case 'review_variation': setActiveTab('scope'); break;
                                        }
                                    };

                                    const categoryStyle: Record<string, { icon: any; ring: string; chip: string }> = {
                                        agreement: { icon: FileCheck, ring: 'border-amber-300 bg-amber-50/60', chip: 'bg-amber-100 text-amber-900' },
                                        payment:   { icon: CreditCard, ring: 'border-rose-200 bg-rose-50/50', chip: 'bg-rose-100 text-rose-900' },
                                        variation: { icon: FileEdit, ring: 'border-orange-200 bg-orange-50/50', chip: 'bg-orange-100 text-orange-900' },
                                        decision:  { icon: CheckSquare, ring: 'border-purple-200 bg-purple-50/40', chip: 'bg-purple-100 text-purple-900' },
                                        material:  { icon: Layers, ring: 'border-sky-200 bg-sky-50/40', chip: 'bg-sky-100 text-sky-900' },
                                    };

                                    if (visible.length === 0) {
                                        return (
                                            <div className="bg-white rounded-3xl p-10 border border-slate-200/80 shadow-2xs text-center space-y-2">
                                                <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-500" />
                                                <p className="font-bold text-slate-800 text-sm">Nothing is waiting on you right now</p>
                                                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                                                    {clientActionSummary.studioActions.length > 0
                                                        ? `Your studio is working through ${clientActionSummary.studioActions.length} item(s) — you can see them below.`
                                                        : `Everything for Stage ${lifecycleInfo.currentStageNumber} is signed off. Your studio will notify you when the next document is ready.`}
                                                </p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                Your turn — {visible.length} item{visible.length === 1 ? '' : 's'}
                                            </div>

                                            <div className="space-y-3">
                                                {visible.map(item => {
                                                    const style = categoryStyle[item.category] || categoryStyle.decision;
                                                    const Icon = style.icon;
                                                    const isCritical = item.severity === 'critical';
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={`p-5 rounded-2xl border transition-all ${
                                                                isCritical ? style.ring : 'border-slate-200 bg-white'
                                                            }`}
                                                        >
                                                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                                                <div className="flex items-start gap-3 min-w-0">
                                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.chip}`}>
                                                                        <Icon className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="space-y-1 min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                isCritical ? 'bg-rose-500 text-white' : style.chip
                                                                            }`}>
                                                                                {item.statusBadge}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[11px] font-semibold text-slate-500">{item.subtitle}</p>
                                                                        <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                                                                        {item.consequence && (
                                                                            <p className="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1">
                                                                                <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                                                                                <span>{item.consequence}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
                                                                    {item.amount ? (
                                                                        <div className="text-right">
                                                                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Amount</p>
                                                                            <p className="text-sm font-black text-slate-900">{formatINR(item.amount)}</p>
                                                                        </div>
                                                                    ) : null}
                                                                    <button
                                                                        onClick={() => runAction(item)}
                                                                        className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                                                            isCritical
                                                                                ? 'bg-slate-900 hover:bg-black text-white'
                                                                                : 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
                                                                        }`}
                                                                    >
                                                                        <Edit3 className="w-3.5 h-3.5" />
                                                                        {item.actionLabel}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ============ AGREEMENT LEDGER ============ */}
                                {(approvalsFilter === 'all' || approvalsFilter === 'agreements') && (
                                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                <FileText className="w-3.5 h-3.5 text-amber-600" />
                                                Agreement Ledger
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-medium">
                                                {approvals.all.filter(a => a.state === 'signed').length} of 3 executed
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                            {approvals.all.map((doc: AgreementStatus) => {
                                                const signed = doc.state === 'signed';
                                                const actionable = doc.needsClientAction;
                                                const overdue = doc.isOverdue && !signed;

                                                // An offline record gets amber chrome, never the emerald
                                                // digital seal. The client should be able to tell at a
                                                // glance how their signature was captured.
                                                const shell = doc.disputed
                                                    ? 'bg-rose-50/60 border-rose-300'
                                                    : signed && doc.recordedOffline
                                                    ? 'bg-amber-50/40 border-amber-200'
                                                    : signed
                                                    ? 'bg-emerald-50/50 border-emerald-200'
                                                    : overdue
                                                        ? 'bg-rose-50/60 border-rose-300'
                                                        : actionable
                                                            ? 'bg-amber-50/70 border-amber-300'
                                                            : 'bg-slate-50/60 border-slate-200';

                                                const stateLabel = doc.disputed
                                                    ? 'You contested this record'
                                                    : signed && doc.recordedOffline
                                                    ? 'Recorded offline'
                                                    : signed
                                                    ? 'Signed & sealed'
                                                    : overdue
                                                        ? 'Overdue'
                                                        : actionable
                                                            ? 'Awaiting your signature'
                                                            : doc.state === 'drafting'
                                                                ? 'With the studio'
                                                                : `Due at Stage ${doc.gateStage}`;

                                                const badgeTone = doc.disputed
                                                    ? 'bg-rose-500 text-white'
                                                    : signed && doc.recordedOffline
                                                    ? 'bg-amber-200 text-amber-950'
                                                    : signed
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : overdue
                                                        ? 'bg-rose-500 text-white'
                                                        : actionable
                                                            ? 'bg-amber-500 text-white'
                                                            : 'bg-slate-200 text-slate-700';

                                                return (
                                                    <div key={doc.kind} className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 ${shell}`}>
                                                        <div className="space-y-2.5">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    {signed
                                                                        ? <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                                                        : <ShieldCheck className={`w-4 h-4 shrink-0 ${actionable ? 'text-amber-600' : 'text-slate-400'}`} />}
                                                                    <h4 className="font-bold text-sm text-slate-900 leading-tight">{doc.title}</h4>
                                                                </div>
                                                            </div>

                                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeTone}`}>
                                                                {stateLabel}
                                                            </span>

                                                            <p className="text-[11px] text-slate-600 leading-relaxed">{doc.purpose}</p>

                                                            {signed ? (
                                                                <div className="pt-2 space-y-1.5 border-t border-slate-200/70">
                                                                    {doc.recordedOffline ? (
                                                                        <>
                                                                            <p className="text-[11px] text-amber-950 leading-relaxed">
                                                                                Signed {MEDIUM_LABEL[doc.approvalMedium || ''] || 'offline'}
                                                                                {doc.signedAt ? ` on ${new Date(doc.signedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                                                                                {' '}and recorded in this portal by <strong>{doc.recordedBy || 'your studio'}</strong>
                                                                                {doc.recordedAt ? ` on ${new Date(doc.recordedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.
                                                                            </p>
                                                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                                                {doc.evidenceUrl && (
                                                                                    <a
                                                                                        href={doc.evidenceUrl}
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer"
                                                                                    >
                                                                                        View signed copy
                                                                                    </a>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => { setDisputeTarget(doc); setDisputeReason(''); }}
                                                                                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 cursor-pointer"
                                                                                >
                                                                                    This doesn&rsquo;t look right
                                                                                </button>
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <p className="text-[11px] text-slate-600">
                                                                            Signed by <strong className="text-slate-900">{doc.signedBy || 'Client'}</strong>
                                                                            {doc.signedAt ? ` on ${new Date(doc.signedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                                                                        </p>
                                                                    )}
                                                                    {!doc.recordedOffline && doc.acceptedOffline && (
                                                                        <p className="text-[10px] text-slate-500 italic">
                                                                            Recorded by the studio{doc.acceptedVia ? ` via ${doc.acceptedVia}` : ''}
                                                                        </p>
                                                                    )}
                                                                    {doc.reference && (
                                                                        <p className="text-[10px] font-mono text-slate-400 truncate" title={String(doc.reference)}>
                                                                            Ref: {doc.reference}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="pt-2 border-t border-slate-200/70 space-y-1">
                                                                    {doc.blockedReason && (
                                                                        <p className="text-[11px] text-slate-500 leading-relaxed">{doc.blockedReason}</p>
                                                                    )}
                                                                    {doc.issuedAt && (
                                                                        <p className="text-[10px] text-slate-400 font-medium">
                                                                            Released {new Date(doc.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-400 font-medium">Stage {doc.gateStage} gate</span>
                                                            {signed ? (
                                                                <button
                                                                    onClick={() => setSigningDocType(doc.kind as AgreementKind)}
                                                                    className="text-xs font-bold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                                                                >
                                                                    View certificate
                                                                </button>
                                                            ) : actionable ? (
                                                                <button
                                                                    onClick={() => setSigningDocType(doc.kind as AgreementKind)}
                                                                    className={`px-3.5 py-2 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                                                                        overdue ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                                                                    }`}
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                    Review & sign
                                                                </button>
                                                            ) : (
                                                                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                                                                    <Clock className="w-3 h-3" />
                                                                    Not yet released
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ============ WITH THE STUDIO ============ */}
                                {clientActionSummary.studioActions.length > 0 && (
                                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                <Clock className="w-3.5 h-3.5 text-[#0066CC]" />
                                                In progress with your studio
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-medium">No action needed from you</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {clientActionSummary.studioActions.map(item => (
                                                <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h5 className="font-bold text-slate-800 text-xs">{item.title}</h5>
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                                            {item.statusBadge}
                                                        </span>
                                                    </div>
                                                    {item.subtitle && <p className="text-[11px] text-slate-500 font-medium">{item.subtitle}</p>}
                                                    <p className="text-[11px] text-slate-600 leading-relaxed">{item.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ============ APPROVAL HISTORY ============ */}
                                {(() => {
                                    const confirmedDecisions = decisions.filter(d => d.status === 'confirmed');
                                    const settledMaterials = materialSelections.filter(m =>
                                        m.status === 'approved' || m.status === 'locked' || m.status === 'ordered'
                                    );
                                    const paidMilestones = milestones.filter(m => m.status === 'paid');
                                    const signedDocs = approvals.all.filter(a => a.state === 'signed');
                                    const historyCount = confirmedDecisions.length + settledMaterials.length + paidMilestones.length + signedDocs.length;

                                    if (historyCount === 0) return null;

                                    const rows = [
                                        ...signedDocs.map(d => ({
                                            key: `h-doc-${d.kind}`,
                                            icon: FileCheck,
                                            label: d.title,
                                            meta: d.signedBy ? `Signed by ${d.signedBy}` : 'Executed',
                                            when: d.signedAt || null,
                                            tone: 'text-emerald-600'
                                        })),
                                        ...paidMilestones.map(m => ({
                                            key: `h-pay-${m.id}`,
                                            icon: CreditCard,
                                            label: m.name,
                                            meta: `Payment received • ${m.percentage}% of ${m.type} value`,
                                            when: m.invoiceDate || m.date || null,
                                            tone: 'text-emerald-600'
                                        })),
                                        ...confirmedDecisions.map(d => ({
                                            key: `h-dec-${d.id}`,
                                            icon: CheckSquare,
                                            label: d.title,
                                            meta: d.selectedOption ? `Confirmed: ${d.selectedOption}` : 'Decision confirmed',
                                            when: d.date || null,
                                            tone: 'text-purple-600'
                                        })),
                                        ...settledMaterials.map(m => ({
                                            key: `h-mat-${m.id}`,
                                            icon: Layers,
                                            label: m.itemName,
                                            meta: `${m.category}${m.finishCode ? ` • ${m.finishCode}` : ''} — ${m.status === 'ordered' ? 'ordered' : 'locked'}`,
                                            when: m.clientConfirmedAt || null,
                                            tone: 'text-[#0066CC]'
                                        })),
                                    ];

                                    rows.sort((a, b) => {
                                        const at = a.when ? new Date(a.when as any).getTime() : 0;
                                        const bt = b.when ? new Date(b.when as any).getTime() : 0;
                                        return bt - at;
                                    });

                                    return (
                                        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                    Approval history
                                                </div>
                                                <span className="text-[11px] text-slate-400 font-medium">{historyCount} recorded</span>
                                            </div>

                                            <div className="divide-y divide-slate-100">
                                                {rows.slice(0, 12).map(row => (
                                                    <div key={row.key} className="py-2.5 flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <row.icon className={`w-3.5 h-3.5 shrink-0 ${row.tone}`} />
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-slate-800 truncate">{row.label}</p>
                                                                <p className="text-[11px] text-slate-500 truncate">{row.meta}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[11px] text-slate-400 font-medium shrink-0">
                                                            {row.when ? new Date(row.when as any).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </motion.div>
                        )}

                        {activeTab === 'documents' && (
                            <motion.div
                                key="documents"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                            >
                                <ClientDocumentVault
                                    projectData={{ ...projectData, context }}
                                    studioName={studioCompanyName}
                                    onOpenDocument={openDocument}
                                />
                            </motion.div>
                        )}

                        {/* Tab 6: MATERIAL SELECTIONS */}
                        {activeTab === 'materials' && (
                            <motion.div
                                key="materials"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
                                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-amber-600" />
                                        Selected Finishes & Vendor Specs
                                    </h3>

                                    {materialSelections.length === 0 ? (
                                        <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                                            No custom material selections logged yet.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {materialSelections.map(mat => (
                                                <div key={mat.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-2xs">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h5 className="font-bold text-slate-900 text-sm">{mat.itemName}</h5>
                                                            <p className="text-xs text-slate-500">{mat.category} • Code: {mat.finishCode}</p>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            mat.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {mat.status.toUpperCase()}
                                                        </span>
                                                    </div>

                                                    {mat.status !== 'approved' && (
                                                        <button
                                                            onClick={() => handleConfirmMaterialSelection(mat.id)}
                                                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                        >
                                                            Approve Finish Code
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 7: SCOPE & BOQ - ZERO-QUESTIONS TRANSPARENT FOCUS & TABLE */}
                        {activeTab === 'scope' && (
                            <motion.div
                                key="scope"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* Executive Scope Summary Card */}
                                <div className="bg-gradient-to-br from-[#0066CC] via-[#0052A3] to-[#003D7A] rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-blue-400/30 space-y-6">
                                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                                        <div className="space-y-2">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sky-100 text-xs font-bold backdrop-blur-md">
                                                <ShieldCheck className="w-4 h-4 text-amber-300" />
                                                Approved Master Deliverables & BOQ
                                            </div>
                                            <h3 className="font-black text-2xl sm:text-3xl text-white tracking-tight">
                                                Scope of Work & Itemized Pricing
                                            </h3>
                                            <p className="text-xs sm:text-sm text-sky-100 max-w-2xl leading-relaxed">
                                                Complete item-by-item transparency. Every deliverable includes its approved quantity, unit rate, specifications, hardware standard, and turnkey execution cost.
                                            </p>
                                        </div>

                                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 shrink-0 w-full lg:w-auto text-left lg:text-right space-y-1 shadow-inner">
                                            <p className="text-[11px] font-bold text-sky-200 uppercase tracking-wider">Total Approved Scope Value</p>
                                            <p className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
                                                {formatINR(totalScopeValue)}
                                            </p>
                                            <p className="text-[10px] text-sky-100 font-medium">
                                                {flatBoqList.length} verified deliverables across {allBoqRooms.length} rooms
                                            </p>
                                        </div>
                                    </div>

                                    {/* Guarantee & Inclusions Bar */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-white/20 text-xs text-sky-100">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                                            <span><strong>Zero Hidden Charges:</strong> All rates include raw material, hardware & finishing.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                                            <span><strong>Factory Precision:</strong> Modular joinery with calibrated edge-banding & soft-close fittings.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                                            <span><strong>Turnkey Delivery:</strong> Certified on-site assembly, alignment, and final QA handover.</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xs space-y-6">
                                    {/* Controls Header */}
                                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                                        <div>
                                            <h4 className="font-bold text-slate-900 text-base">
                                                Deliverables Directory
                                            </h4>
                                            <p className="text-xs text-slate-500">
                                                Filter by room, trade discipline, or search specific carpentry schedules.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Room Budget Distribution Chips */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quick Room Filter & Budget Allocation</p>
                                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                                            <button
                                                onClick={() => setBoqRoomFilter('all')}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                                                    boqRoomFilter === 'all'
                                                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span>All Rooms</span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${boqRoomFilter === 'all' ? 'bg-slate-800 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
                                                    {formatINR(totalScopeValue)}
                                                </span>
                                            </button>

                                            {allBoqRooms.map(r => {
                                                const sub = roomSubtotals[r];
                                                const isActive = boqRoomFilter === r;
                                                return (
                                                    <button
                                                        key={r}
                                                        onClick={() => setBoqRoomFilter(isActive ? 'all' : r)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                                                            isActive
                                                                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <span>{r}</span>
                                                        {sub && (
                                                            <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-black ${isActive ? 'bg-amber-600/30 text-slate-950' : 'bg-slate-100 text-slate-600'}`}>
                                                                {formatINR(sub.total)}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Search & Filter Strip */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200">
                                        <div className="relative md:col-span-2">
                                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={boqSearchQuery}
                                                onChange={(e) => setBoqSearchQuery(e.target.value)}
                                                placeholder="Search by item, specifications, finish..."
                                                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <select
                                                value={boqRoomFilter}
                                                onChange={(e) => setBoqRoomFilter(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-hidden"
                                            >
                                                <option value="all">All Rooms ({allBoqRooms.length})</option>
                                                {allBoqRooms.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <select
                                                value={boqTradeFilter}
                                                onChange={(e) => setBoqTradeFilter(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-hidden"
                                            >
                                                <option value="all">All Trades ({allBoqTrades.length})</option>
                                                {allBoqTrades.map(t => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Content Area */}
                                    {flatBoqList.length === 0 ? (
                                        <div className="py-16 text-center border border-dashed border-slate-200 rounded-3xl space-y-3">
                                            <div className="w-16 h-16 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                                                <FileText className="w-8 h-8" />
                                            </div>
                                            <p className="font-bold text-slate-900 text-base">No BOQ Items Uploaded</p>
                                            <p className="text-slate-500 text-xs">Your finalized Bill of Quantities will be published here once approved.</p>
                                        </div>
                                    ) : (
                                        <div>
                                            {/* Filtered items */}
                                            {(() => {
                                                const filteredFlat = flatBoqList.filter(item => {
                                                    const room = item.roomId || item.roomGroup || '';
                                                    const trade = item.cat || 'General Scope';
                                                    if (boqRoomFilter !== 'all' && room !== boqRoomFilter) return false;
                                                    if (boqTradeFilter !== 'all' && trade !== boqTradeFilter) return false;
                                                    if (boqSearchQuery) {
                                                        const q = boqSearchQuery.toLowerCase();
                                                        const matchItem = item.item && item.item.toLowerCase().includes(q);
                                                        const matchDesc = item.description && item.description.toLowerCase().includes(q);
                                                        const matchRoom = room.toLowerCase().includes(q);
                                                        const matchTrade = trade.toLowerCase().includes(q);
                                                        if (!matchItem && !matchDesc && !matchRoom && !matchTrade) return false;
                                                    }
                                                    return true;
                                                });

                                                if (filteredFlat.length === 0) {
                                                    return (
                                                        <div className="py-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-2">
                                                            <Layers className="w-8 h-8 mx-auto text-slate-300" />
                                                            <p className="font-bold text-slate-600">No items match your active filters.</p>
                                                            <p>Try resetting the search or selecting &quot;All Rooms&quot; / &quot;All Trades&quot;.</p>
                                                        </div>
                                                    );
                                                }

                                                // Group filtered by room for hierarchical viewing
                                                const roomGroups: Record<string, any[]> = {};
                                                filteredFlat.forEach(item => {
                                                    const r = item.roomId || item.roomGroup || 'General Scope';
                                                    if (!roomGroups[r]) roomGroups[r] = [];
                                                    roomGroups[r].push(item);
                                                });

                                                // Tabular Mode (Simplified & Synced with Approved/Revised BOQ)
                                                return (
                                                    <div className="space-y-8">
                                                        {Object.entries(roomGroups).map(([roomName, items]) => {
                                                            const roomTotal = items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

                                                            return (
                                                                <div key={roomName} className="space-y-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                                                            {roomName}
                                                                        </h4>
                                                                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                                                                            {items.length} items · {formatINR(roomTotal)}
                                                                        </span>
                                                                    </div>

                                                                    <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white">
                                                                        <table className="w-full text-left border-collapse min-w-[720px]">
                                                                            <thead>
                                                                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider font-black text-slate-500">
                                                                                    <th className="px-4 py-3 w-10 text-center">#</th>
                                                                                    <th className="px-4 py-3">Deliverable Item</th>
                                                                                    <th className="px-4 py-3 w-36">Discipline</th>
                                                                                    <th className="px-4 py-3 w-28 text-right">Quantity</th>
                                                                                    <th className="px-4 py-3 w-28 text-right">Unit Rate</th>
                                                                                    <th className="px-4 py-3 w-32 text-right">Item Total</th>
                                                                                    <th className="px-4 py-3 w-28 text-center">Status</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                                                {items.map((item: any, idx: number) => {
                                                                                    const catInfo = getCategoryInfo(item.cat);
                                                                                    const itemTotal = Number(item.total) || 0;
                                                                                    const itemRate = Number(item.rate) || (item.qty > 0 ? itemTotal / item.qty : 0);
                                                                                    const isAdded = item.status === 'Added';
                                                                                    const isRevised = item.status === 'Revised';

                                                                                    return (
                                                                                        <tr 
                                                                                            key={item.id || idx} 
                                                                                            className="hover:bg-slate-50/70 transition-colors"
                                                                                        >
                                                                                            <td className="px-4 py-3.5 text-center text-xs font-bold text-slate-400">
                                                                                                {(idx + 1).toString().padStart(2, '0')}
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 align-middle">
                                                                                                <p className="font-bold text-slate-900 text-xs">{item.item}</p>
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 align-middle">
                                                                                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${catInfo.color}`}>
                                                                                                    {catInfo.label}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 text-right align-middle">
                                                                                                <span className="font-black text-slate-900 text-xs">{item.qty}</span>
                                                                                                <span className="font-bold text-slate-500 text-[10px] uppercase ml-1">{item.unit}</span>
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 text-right align-middle text-xs font-bold text-slate-600">
                                                                                                {itemRate > 0 ? formatINR(itemRate) : '—'}
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 text-right align-middle">
                                                                                                <span className="font-black text-amber-950 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg text-xs inline-block">
                                                                                                    {formatINR(itemTotal)}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td className="px-4 py-3.5 text-center align-middle">
                                                                                                {isAdded ? (
                                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                                                                                        <Sparkles className="w-3 h-3 text-amber-600" /> Added
                                                                                                    </span>
                                                                                                ) : isRevised ? (
                                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                                                                                        <Clock className="w-3 h-3 text-blue-600" /> Revised
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                                                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Approved
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                            <tfoot>
                                                                                <tr className="bg-slate-50/90 font-black text-xs border-t border-slate-200">
                                                                                    <td colSpan={5} className="px-4 py-3 text-right text-slate-600 font-bold text-xs">
                                                                                        {roomName} Subtotal:
                                                                                    </td>
                                                                                    <td className="px-4 py-3 text-right text-amber-950 font-black text-xs bg-amber-50/50 border-t border-amber-200">
                                                                                        {formatINR(roomTotal)}
                                                                                    </td>
                                                                                    <td colSpan={1}></td>
                                                                                </tr>
                                                                            </tfoot>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Grand Total Summary in Table */}
                                                        <div className="bg-gradient-to-r from-[#0066CC] to-[#004C99] text-white p-5 rounded-2xl flex items-center justify-between border border-blue-500/30 shadow-md">
                                                            <div>
                                                                <p className="text-xs text-sky-200 font-bold uppercase tracking-wider">Grand Total Approved Scope</p>
                                                                <p className="text-xs text-sky-100">All rooms, materials, branded fittings & installation</p>
                                                            </div>
                                                            <p className="text-2xl font-black text-amber-300">
                                                                {formatINR(totalScopeValue)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 8: FINANCIALS & INVOICES */}
                        {activeTab === 'financials' && (
                            <motion.div
                                key="financials"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* Fee Breakdown Dashboards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Design Fees Tracking */}
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1 block">Design Fees Tracking</span>
                                                <h3 className="text-2xl font-black text-slate-900">{formatINR(totalDesignValue)}</h3>
                                                <p className="text-[11px] text-slate-500 mt-1">Includes Base Fee: {formatINR(taxableDesign)} + GST</p>
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                                <FileEdit className="w-5 h-5 text-indigo-600" />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center text-[11px] mb-1.5 font-bold text-slate-600">
                                                <span>Amount Cleared: {formatINR(designPaid)}</span>
                                                <span className="text-indigo-700">{designPaidPercentage}%</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${designPaidPercentage}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Execution Fees Tracking */}
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0066CC] mb-1 block">Execution Contract Tracking</span>
                                                <h3 className="text-2xl font-black text-slate-900">{formatINR(totalExecutionValue)}</h3>
                                                <p className="text-[11px] text-slate-500 mt-1">Includes Base Value: {formatINR(taxableExecution)} + GST</p>
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                                                <Layers className="w-5 h-5 text-[#0066CC]" />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center text-[11px] mb-1.5 font-bold text-slate-600">
                                                <span>Amount Cleared: {formatINR(executionPaid)}</span>
                                                <span className="text-[#0066CC]">{executionPaidPercentage}%</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#0066CC] rounded-full transition-all duration-500" style={{ width: `${executionPaidPercentage}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-6">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                                <Wallet className="w-4 h-4 text-amber-600" />
                                                Milestone Payment Schedule & Invoices
                                            </h3>
                                            <p className="text-xs text-slate-600 mt-0.5">
                                                Transparent invoice schedule for Design & Execution phases.
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => setShowBankDetailsModal(true)}
                                            className="px-3.5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                                        >
                                            <CreditCard className="w-3.5 h-3.5" />
                                            Pay via Bank Transfer
                                        </button>
                                    </div>

                                    {/* Milestone List */}
                                    <div className="space-y-3">
                                        {milestones.map((m) => {
                                            const amount = calculateMilestoneTotal(m);
                                            return (
                                                <div 
                                                    key={m.id} 
                                                    className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                                                        m.status === 'paid' ? 'bg-emerald-50/50 border-emerald-200' :
                                                        m.status === 'invoiced' ? 'bg-rose-50/50 border-rose-200' :
                                                        'bg-white border-slate-200'
                                                    }`}
                                                >
                                                    <div className="space-y-1 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <h5 className="font-bold text-slate-900 text-sm">{m.name} ({m.percentage}%)</h5>
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                m.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                                                m.status === 'invoiced' ? 'bg-rose-100 text-rose-800' :
                                                                'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {m.status ? m.status.toUpperCase() : 'UPCOMING'}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-600">{m.description || 'Contract milestone payment'}</p>
                                                    </div>

                                                    <div className="text-right shrink-0 space-y-1">
                                                        <p className="text-base font-black text-slate-900">{formatINR(amount)}</p>
                                                        {m.status === 'invoiced' && (
                                                            <button
                                                                onClick={() => setShowBankDetailsModal(true)}
                                                                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                                                            >
                                                                Pay Invoice
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* LIGHTBOX MODAL */}
            {lightboxImage && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                        <button
                            onClick={() => setLightboxImage(null)}
                            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black transition-colors cursor-pointer z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <img src={lightboxImage.url} alt={lightboxImage.title} className="w-full max-h-[75vh] object-contain bg-black" />
                        <div className="p-4 bg-slate-950 text-white space-y-1">
                            <h4 className="font-bold text-base">{lightboxImage.title}</h4>
                            {lightboxImage.subtitle && <p className="text-xs text-slate-400">{lightboxImage.subtitle}</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* BANK DETAILS MODAL */}
            {showBankDetailsModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-amber-600" />
                                Studio Bank Account & UPI
                            </h3>
                            <button onClick={() => setShowBankDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                <p className="text-slate-500 font-medium">Beneficiary Name</p>
                                <p className="font-bold text-slate-900 text-sm">{settings?.companyName || studioCompanyName}</p>
                            </div>

                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-medium">Bank Name</span>
                                    <span className="font-bold text-slate-800">{settings?.bankDetails?.bankName || 'HDFC Bank Ltd.'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-medium">Account Number</span>
                                    <span className="font-mono font-bold text-slate-900">{settings?.bankDetails?.accountNumber || '50200012345678'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-medium">IFSC Code</span>
                                    <span className="font-mono font-bold text-amber-800">{settings?.bankDetails?.ifscCode || 'HDFC0001234'}</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1 text-amber-950">
                                <p className="font-bold text-xs">Payment Notice</p>
                                <p className="text-[11px] leading-relaxed">
                                    Please share the payment transaction UTR reference with your Studio PM to update your milestone status instantly.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowBankDetailsModal(false)}
                            className="w-full py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* CONTACT STUDIO PM MODAL */}
            {showContactModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-amber-600" />
                                Send Note to Studio Manager
                            </h3>
                            <button onClick={() => setShowContactModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSendMessageToStudio} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Your Query or Feedback</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={clientMessageText}
                                    onChange={(e) => setClientMessageText(e.target.value)}
                                    placeholder="Type your message regarding design preferences, site visits, or invoices..."
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={clientMessageSent}
                                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                Send Message
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* STUDIO OWNER QUICK ADD SITE UPDATE MODAL */}
            {showAddUpdateModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-900 text-base">Post Live Site Progress Photo</h3>
                            <button onClick={() => setShowAddUpdateModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddSiteUpdateFromStudio} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Update Title</label>
                                <input
                                    type="text"
                                    required
                                    value={newUpdateTitle}
                                    onChange={(e) => setNewUpdateTitle(e.target.value)}
                                    placeholder="e.g. Master Bedroom Carpentry Assembly"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Progress Notes</label>
                                <textarea
                                    rows={3}
                                    value={newUpdateDesc}
                                    onChange={(e) => setNewUpdateDesc(e.target.value)}
                                    placeholder="e.g. Plywood carcass work completed today. Veneer pressing scheduled for tomorrow."
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Image URL (Optional)</label>
                                <input
                                    type="url"
                                    value={newUpdateImageUrl}
                                    onChange={(e) => setNewUpdateImageUrl(e.target.value)}
                                    placeholder="https://images.unsplash.com/photo-..."
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 bg-amber-900 hover:bg-black text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Publish to Client Feed
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* STUDIO OWNER QUICK ADD DECISION MODAL */}
            {showAddDecisionModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-900 text-base">Request Client Selection / Decision</h3>
                            <button onClick={() => setShowAddDecisionModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddDecisionFromStudio} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Decision Subject</label>
                                <input
                                    type="text"
                                    required
                                    value={newDecisionTitle}
                                    onChange={(e) => setNewDecisionTitle(e.target.value)}
                                    placeholder="e.g. Kitchen Laminate Finish Code Selection"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Room / Area</label>
                                <input
                                    type="text"
                                    value={newDecisionRoom}
                                    onChange={(e) => setNewDecisionRoom(e.target.value)}
                                    placeholder="e.g. Kitchen & Dining"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Choice Options</label>
                                <textarea
                                    rows={3}
                                    value={newDecisionDesc}
                                    onChange={(e) => setNewDecisionDesc(e.target.value)}
                                    placeholder="e.g. Please confirm Option A (Suede Oak 4022) vs Option B (Fluted Teak 8011)."
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Send Decision Request
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* FOCUSED BOQ ITEM INSPECTOR MODAL - ZERO-QUESTIONS TRANSPARENCY */}
            {focusedBoqItem && (() => {
                const itemTotal = Number(focusedBoqItem.total) || 0;
                const itemRate = Number(focusedBoqItem.rate) || (focusedBoqItem.qty > 0 ? itemTotal / focusedBoqItem.qty : 0);

                return (
                    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200/80 px-2.5 py-0.5 rounded-lg">
                                            {focusedBoqItem.roomId || focusedBoqItem.roomGroup || 'Scope Deliverable'}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                                            {getCategoryInfo(focusedBoqItem.cat).label}
                                        </span>
                                    </div>
                                    <h3 className="font-black text-slate-900 text-lg sm:text-xl pt-1">
                                        {focusedBoqItem.item}
                                    </h3>
                                </div>

                                <button 
                                    onClick={() => setFocusedBoqItem(null)} 
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* COST TRANSPARENCY CARD */}
                            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 rounded-2xl p-5 text-white border border-slate-800 space-y-3 shadow-md">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approved Item Investment</span>
                                        <p className="text-2xl sm:text-3xl font-black text-amber-400">{formatINR(itemTotal)}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scope Deliverable</span>
                                        <p className="text-sm font-black text-slate-200">{focusedBoqItem.qty} {focusedBoqItem.unit}</p>
                                    </div>
                                </div>

                                {itemRate > 0 && (
                                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                                        <span>Unit Calculation: <strong>{formatINR(itemRate)} / {focusedBoqItem.unit}</strong></span>
                                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> All Turnkey Taxes & Labour Included
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Specs & Hardware Inclusions */}
                            <div className="space-y-4 text-xs">
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                                        Detailed Technical Specification
                                    </span>
                                    <p className="text-slate-800 text-xs sm:text-sm leading-relaxed font-normal whitespace-pre-line">
                                        {focusedBoqItem.description || 'Standard studio architectural joinery & hardware specifications apply for this line item.'}
                                    </p>
                                </div>

                                {/* Turnkey Execution Checklist */}
                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                                        Quality Standards & Inclusions (Zero Hidden Extras)
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>BWP/BWR Calibrated Core Ply</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>German Soft-Close Hardware</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>2mm Factory Edge-Banded Finish</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>On-site Assembly & QA Alignment</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Related materials if any */}
                                {(() => {
                                    const relatedMats = materialSelections.filter(m => 
                                        m.itemName?.toLowerCase().includes((focusedBoqItem.item || '').toLowerCase()) ||
                                        (focusedBoqItem.item && m.itemName && focusedBoqItem.item.toLowerCase().includes(m.itemName.toLowerCase()))
                                    );

                                    if (relatedMats.length > 0) {
                                        return (
                                            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                                                <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                                    Selected Finishes & Codes
                                                </span>
                                                <div className="space-y-1.5">
                                                    {relatedMats.map(m => (
                                                        <div key={m.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-amber-100 text-xs">
                                                            <span className="font-bold text-slate-800">{m.category}: {m.finishCode}</span>
                                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                                                {m.status?.toUpperCase() || 'APPROVED'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setClientMessageText(`Hi Team, regarding [${focusedBoqItem.item}] in [${focusedBoqItem.roomId || 'Scope'}]: I had a question regarding `);
                                        setFocusedBoqItem(null);
                                        setShowContactModal(true);
                                    }}
                                    className="w-full sm:w-1/2 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Ask Studio PM About This
                                </button>
                                <button
                                    onClick={() => setFocusedBoqItem(null)}
                                    className="w-full sm:w-1/2 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                >
                                    Close Details
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* In-Portal Digital Signature & Docket Viewer Modal */}
            {disputeTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 bg-rose-50 flex items-center gap-2.5">
                            <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                            <h3 className="text-sm font-bold text-rose-950">
                                Contest this record — {disputeTarget.title}
                            </h3>
                        </div>

                        <div className="p-5 space-y-4">
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Your studio recorded that you signed this{' '}
                                {MEDIUM_LABEL[disputeTarget.approvalMedium || ''] || 'offline'}
                                {disputeTarget.recordedBy ? ` (entered by ${disputeTarget.recordedBy})` : ''}.
                                If that is not right, tell us what happened. The document goes back to
                                unsigned and your studio is notified straight away.
                            </p>

                            <textarea
                                value={disputeReason}
                                onChange={(e) => setDisputeReason(e.target.value)}
                                rows={4}
                                autoFocus
                                placeholder="e.g. I never signed this, or the version I signed was different."
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-400 resize-none"
                            />

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={() => setDisputeTarget(null)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitDispute}
                                    disabled={!disputeReason.trim()}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer"
                                >
                                    Notify my studio
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {readingRoomKind && (
                <DocumentReadingRoom
                    kind={readingRoomKind}
                    issueId={readingRoomIssueId}
                    projectData={{ ...projectData, context }}
                    onClose={() => { setReadingRoomKind(null); setReadingRoomIssueId(undefined); }}
                    onSignComplete={(docket) => {
                        // Always record the signature against the issue itself —
                        // that is the whole record for an addendum, which has no
                        // lifecycle gate of its own. Gated agreements additionally
                        // write through the canonical signoff patch.
                        if (docket.issueId) setProjectContext(signIssue(docket.issueId, docket));
                        const issue = getCurrentIssue(context, readingRoomKind);
                        const isAddendum = !!issue && docket.issueId !== issue.id;
                        const agreement = agreementKindFor(readingRoomKind);
                        if (agreement && !isAddendum) handleSignDocComplete(docket, agreement);
                        setReadingRoomKind(null);
                        setReadingRoomIssueId(undefined);
                    }}
                    onRaiseQuery={(clauseRef, excerpt, question) => {
                        const issue = getCurrentIssue(context, readingRoomKind);
                        if (!issue) return;
                        setProjectContext(raiseQuery({
                            issueId: issue.id,
                            documentKind: readingRoomKind,
                            clauseRef,
                            clauseExcerpt: excerpt,
                            question,
                            raisedBy: context.clientName || 'Client'
                        }));
                        setReadingRoomKind(null);
                        setSignSuccessMessage(
                            `Your question about clause ${clauseRef} has been sent to your studio.`
                        );
                        setTimeout(() => setSignSuccessMessage(null), 8000);
                    }}
                />
            )}

            {/* Official Minutes of Meeting (MoM) Viewer & Sign-off Modal */}
            <ClientMoMViewerModal
                isOpen={!!selectedMomForViewer}
                onClose={() => setSelectedMomForViewer(null)}
                mom={selectedMomForViewer}
                studioName={studioCompanyName}
                projectName={context.name || (projectData as any).name || (projectData as any).title || 'Project Workspace'}
                clientName={context.clientName || 'Valued Client'}
                studioId={studioId}
                projectId={projectData.id}
                onAcknowledgeSuccess={(updatedMom) => {
                    setSelectedMomForViewer(updatedMom);
                }}
            />
        </div>
    );
}
