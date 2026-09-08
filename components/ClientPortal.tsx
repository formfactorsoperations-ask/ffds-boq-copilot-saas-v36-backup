import React, { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
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
import { useTimelinePhases } from '../hooks/useTimelinePhases';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePaymentRequests, usePaymentOverdueCheck } from '../hooks/usePaymentRequests';
import { db, functions } from '../services/firebaseClient';
import { recordClientSignoff, recordManualSignoff } from '../services/decisionsService';
import ClientDecisionCard from './client/ClientDecisionCard';
import ClientAccountMenu from './client/ClientAccountMenu';
import { buildClientBoqRows, groupClientBoq, ClientBoqRow } from '../lib/clientBoq';
import { submitClientAction, ClientAction } from '../services/clientPortalActions';
import { isVisibleToClient } from '../lib/clientVisibility';
import PortalOverview from './client/PortalOverview';
import PortalTimeline from './client/PortalTimeline';
import { buildSpine, buildCatchUp, stageOfMilestone, AttachmentKind } from './client/spineModel';
import { buildProgramme } from './client/programme';
import PortalHero from './client/PortalHero';
// DocumentsTable is deliberately not used: ClientDocumentVault already renders
// the client's document record from the same issue engine, with versions,
// queries and addenda a flat table cannot carry.
import { DecisionsTable } from './client/PortalTables';
import PortalPayments from './client/PortalPayments';
import { issuePortalAccess } from '../services/portalAccessService';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { 
    calculateClientLifecycleStages, 
    calculateClientActionItems, 
    getUpcomingStudioSteps, 
    ClientActionItem,
    AgreementStatus,
    decisionNature
} from '../services/clientPortalEngine';
import { buildSignoffPatch, buildDisputePatch, resolveApprovals, AgreementKind } from '../services/clientApprovalEngine';
import DocumentReadingRoom from './client/DocumentReadingRoom';
import { FFDSLogo } from './FFDSLogo';
import BoqVersionCompare from './client/BoqVersionCompare';
import { describeVersions } from '../lib/boqVersions';
import { buildBankMap } from '../lib/boqPricing';
import ClientDocumentVault from './client/ClientDocumentVault';
import { ClientMoMViewerModal } from './client/ClientMoMViewerModal';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import {
    getCurrentIssue,
    recordDocumentView,
    resolveDocumentState,
    agreementKindFor,
    signIssue
} from '../services/documentIssueEngine';
import { raiseQuery, getOpenQueries } from '../services/documentQueryEngine';
import { ClientDocumentKind } from '../types';

/**
 * Every view the portal can show. The five in PORTAL_LENSES are navigable; the
 * rest are opened by an action. `timeline` was being set without being in this
 * union, which type-checked only because the dev server does not typecheck.
 */
type PortalTab =
    | 'overview' | 'timeline' | 'decisions' | 'documents' | 'financials'
    | 'approvals' | 'roadmap' | 'feed' | 'designs' | 'materials' | 'scope'
    | 'designScope';
import DigitalSignatureDocketView from './common/DigitalSignatureDocket';
import { 
    LayoutDashboard, 
    CalendarDays, 
    Wallet, 
    ClipboardList, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    ChevronLeft,
    ChevronRight,
    CheckSquare,
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
    Mail,
    Activity,
    GitMerge,
    Image as ImageIcon,
    Camera,
    MinusCircle,
    FileEdit,
    Folder,
    Map as MapIcon,
    BookOpen,
    Info,
    HelpCircle,
    ShieldCheck,
    Printer,
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
    /**
     * Where projectData came from.
     *
     * 'studio' is the preview inside the ops app: the live project, with tiers,
     * timeline and the studio's tenant in context. 'client' is a signed-in
     * client's own session, whose projectData is the published projection and
     * nothing else — one document, by design.
     *
     * The distinction matters because this screen also reads Firestore directly
     * for site visits, meeting notes, step progress, timeline phases and
     * payment requests. Those paths are keyed by tenant, and a client has no
     * tenant, so in a client session they would resolve against
     * 'demo-tenant-01' — the wrong studio — and be refused. Worse, if they ever
     * were readable they would bypass the projection entirely, which is the one
     * thing that makes "not published" mean "not sent".
     */
    source?: 'studio' | 'client';
    /*
      The scope rows App is sending to the client, for the studio's preview.

      Without this the preview fell back to deriving its own rows, and that
      derivation has no previous version to compare against — so the preview
      showed no New or Revised markers while the client's copy showed them.
      A preview whose job is "what exactly the client sees" cannot be assembled
      a second way; it takes the same array that gets stored.
    */
    clientBoq?: ClientBoqRow[];
}

export default function ClientPortal({ projectData, bank, onLogout, onProjectUpdate, source = 'studio', clientBoq }: ClientPortalProps) {
    const isInternalStudioView = !onLogout;

    /*
      The raised pill on the lens bar, measured rather than shared-layout.

      `layoutId` was the obvious way to do this and it did not animate at all —
      transform stayed `none` through the whole transition and the pill simply
      snapped to the new tab. Measuring the active button and animating one
      persistent element is deterministic: it cannot silently do nothing.
    */
    const lensTrackRef = useRef<HTMLDivElement>(null);
    const [lensPill, setLensPill] = useState<{ left: number; width: number } | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkNavScroll = () => {
        const el = lensTrackRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 6);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
    };

    const scrollLens = (direction: 'left' | 'right') => {
        if (!lensTrackRef.current) return;
        lensTrackRef.current.scrollBy({
            left: direction === 'left' ? -150 : 150,
            behavior: 'smooth'
        });
    };


    /**
     * A link the client can actually open, copied to the clipboard.
     *
     * Reuses the project's live token so an already-issued link keeps working;
     * mints and persists one when there is none, or when the last one has
     * lapsed. Minting invalidates whatever was sent before, which is the
     * intended way to revoke a link that went to the wrong inbox.
     */
    const copyClientLink = async () => {
        const existing = (context as any)?.portalAccess as
            | { token: string; expiresAt?: string }
            | undefined;
        const live =
            existing?.token &&
            (!existing.expiresAt || new Date(existing.expiresAt).getTime() > Date.now());

        let token = existing?.token;
        if (!live) {
            const access = issuePortalAccess(projectData.id, (context as any)?.clientEmail);
            token = access.token;
            onProjectUpdate?.({
                ...projectData,
                context: { ...(context as any), portalAccess: access },
                lastModified: Date.now(),
            } as any);
        }

        const link = `${window.location.origin}/?portal=${token}`;
        try {
            await navigator.clipboard?.writeText(link);
            setSignSuccessMessage(
                live ? 'Client link copied' : 'New client link copied — any earlier link has stopped working',
            );
        } catch {
            setSignSuccessMessage(link);
        }
        setTimeout(() => setSignSuccessMessage(null), 6000);
    };

    const { orgData } = useOrg();
    const { settings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
    const studioCompanyName = settings?.companyName || orgData?.orgName || 'Form Factors Design Studio';
    /*
      Bank details reach a client through the portal projection the studio
      writes, not by the client reading studioSettings — that collection also
      holds team emails and GSTIN and is no longer world-readable. The hook is
      the fallback for the studio's own preview.
    */
    const bankDetails = (projectData?.context as any)?.portalStudio?.bankDetails
        || (settings as any)?.bankDetails
        || null;

    const primaryThemeColor = settings?.primaryColor || orgData?.themeColor || '#0f172a';
    /* `tiers` defaults because the projection does not carry any — it holds no
       rates and no BOQ by design. Without the default, `tiers.find(...)` below
       throws on the client's very first render and the portal is replaced by
       the error screen. */
    const { context: propContext, tiers = [], timeline = [] } = projectData;
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
    /* Empty in a client session, which is what switches off every direct
       Firestore read on this screen: the two listeners below and all three
       hooks already bail on a blank studioId. The client's copy comes from the
       projection instead. */
    const studioId = source === 'client' ? '' : (orgData?.tenantId || 'demo-tenant-01');

    const { steps: stepProgressSteps } = useStepProgress(projectData.id, studioId);

    /**
     * The project's own design phases — the same Firestore collection the
     * studio's Timeline tab reads. Without these the portal was calling
     * `buildScheduleFromProject` with no `designSteps`, which falls back to a
     * generic five-step template anchored to today; that is why the portal drew
     * a programme starting this month while the studio's Gantt showed the real
     * anchor of 27 Jul 2026.
     */
    const { phases: designPhases } = useTimelinePhases(projectData.id, studioId);
    usePaymentOverdueCheck(projectData.id, studioId);
    
    // Active Tab State.
    // Five of these are lenses the client can navigate to (see PORTAL_LENSES).
    // The rest are destinations only — reached by acting on something, never by
    // browsing. `signing` and `scope` open because an item sent the client
    // there; they are not places to wander into.
    const [activeTab, setActiveTab] = useState<PortalTab>('overview');

    /**
     * A general question about a whole document.
     *
     * raiseQuery was only reachable from inside the Reading Room, against a
     * specific clause — so a client who simply wanted to ask about a document
     * had to open it, find a clause and comment on that. This asks about the
     * document itself, and lands in the same query inbox ops already has.
     */
    const [questionFor, setQuestionFor] = useState<ClientDocumentKind | null>(null);
    const [questionText, setQuestionText] = useState('');

    /**
     * Which half of Design & Scope is showing.
     *
     * Stacked, the drawings grid and a full room-by-room BOQ made one lens the
     * length of three screens. They are two different questions — "what will it
     * look like" and "what am I getting" — so they get two sub-tabs rather than
     * a scroll.
     */
    const [designScopeTab, setDesignScopeTab] = useState<'drawings' | 'scope'>('drawings');

    /** The scope revision history, and whether the compare modal is open. */
    const [showBoqVersions, setShowBoqVersions] = useState(false);
    /* Bank plus the project's own ad-hoc items — the same map App.tsx prices
       tiers with. Without the ad-hoc items, any line added outside the bank
       resolves to no name and no rate. */
    const boqBankMap = useMemo(
        () => buildBankMap(bank as any, (context as any).adHocItems),
        [bank, (context as any).adHocItems],
    );
    const boqVersionSet = useMemo(
        () => describeVersions(tiers as any, boqBankMap, {
            approvedTierId: context.approvedTierId,
            activeTierId: projectData.activeTierId,
            revisionCount: (context.boqRevisions || []).length,
        }),
        [tiers, boqBankMap, context.approvedTierId, projectData.activeTierId, context.boqRevisions],
    );
    const boqVersions = boqVersionSet.versions;

    /** Scopes the spine to one kind of thing. 'all' is the resting state. */
    const [spineFilter, setSpineFilter] = useState<AttachmentKind | 'all'>('all');

    /** The catch-up panel: opened from the hero, rendered under the lens bar. */
    const [catchOpen, setCatchOpen] = useState(false);
    
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
        persistClientAction({ type: 'documentView', kind });
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
                    if (!isVisibleToClient(v)) return false;
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
                    if (!isVisibleToClient(m)) return false;
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

    /*
      Persist one client action through the server.

      The local view is updated first, by the same engines, so the client sees
      an immediate response. This is the durable half — and if it is refused,
      the view they are looking at is wrong, so the failure is said out loud
      rather than logged. The studio preview persists the old way: it is the
      studio's own session, writing their own project.
    */
    const persistClientAction = (action: ClientAction) => {
        if (source !== 'client') return;
        submitClientAction(projectData.id, action).catch((err: any) => {
            console.error('Client action was refused', action, err);
            alert(
                'That could not be saved. Please tell your studio rather than assuming it went through.\n\n' +
                (err?.message || 'Unknown error'),
            );
        });
    };

    const setProjectContext = (updater: any) => {
        const current = localContext || projectData.context;
        const nextContext = typeof updater === 'function' ? updater(current) : updater;
        setLocalContext(nextContext);
        /*
          A client session never saves the project document. Its changes travel
          as actions through persistClientAction, which is the only path the
          rules still allow.
        */
        if (source !== 'client' && onProjectUpdate) {
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
        // studioId gates this too: the callable takes an orgId, and a client
        // session has none to give.
        if (context.operativeBoqVersion && projectData.id && studioId && functions) {
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
        // Same arguments the studio's Timeline passes, so both derive the
        // identical schedule rather than two different ones.
        return buildScheduleFromProject(projectData.context, displayBoq, {
            designSteps: designPhases as any,
        });
    }, [customSchedule, projectData.context, displayBoq, designPhases]);

    // --- BOQ CATEGORIZATION & REVISIONS ---
    const boqRevisions = context.boqRevisions || [];

    /*
        The scope, from whichever source this session actually has.

        A signed-in client has no tiers and no item bank — they read a stored
        projection — so deriving the BOQ here returned {} for them and the scope
        tab was empty. The projection now carries `clientBoq`, already reduced to
        client-safe rows, and it is preferred whenever present.

        Both paths end in the same rows from the same function, so the studio's
        preview shows precisely what the client is looking at rather than
        something assembled a second way.
    */
    const boqByCategory = useMemo(() => {
        // The client's own session: exactly what was sent, nothing derived.
        const stored = (context as any).clientBoq as ClientBoqRow[] | undefined;
        if (stored?.length) return groupClientBoq(stored);

        // The studio's preview: the same rows, before they are sent.
        if (clientBoq?.length) return groupClientBoq(clientBoq);

        if (!activeTier) return {};

        return groupClientBoq(buildClientBoqRows({
            boq: displayBoq,
            bank: bank as any,
            rooms: projectData.context.rooms as any,
            revisions: boqRevisions,
        }));
    }, [activeTier, bank, projectData.context.rooms, boqRevisions, displayBoq, (context as any).clientBoq, clientBoq]);

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
    
    /**
     * What one milestone is worth to the client.
     *
     * This has to agree with the studio's Money tab to the rupee, and it did
     * not: the portal computed in full precision while PaymentCalculatorTab
     * rounds at every step, and the portal ignored the initiation fee that the
     * Money tab deducts from the first design invoice. So the client's portal
     * showed ₹2,45,708 where the studio's own screen showed ₹2,44,571, and a
     * gross ₹50,000 where the studio showed ₹45,001 net of the retainer.
     *
     * The rounding below is deliberate and mirrors PaymentCalculatorTab line
     * for line. Two screens quoting different figures for the same invoice is
     * worse than either figure being slightly off.
     */
    const calculateMilestoneTotal = (m: PaymentMilestone) => {
        const isFirstDesign =
            m.type === 'design' &&
            milestones.filter(x => x.type === 'design').indexOf(m) === 0;

        let baseAmount = m.type === 'design' ? taxableDesign : taxableExecution;
        if (m.lockedTaxableBase !== undefined) baseAmount = m.lockedTaxableBase;

        const rowBaseOriginal = Math.round(
            m.isFixedAmount && m.fixedAmount !== undefined
                ? m.fixedAmount
                : baseAmount * (m.percentage / 100),
        );

        if (m.type === 'execution') {
            const rowBillable = Math.round(rowBaseOriginal * (billablePercent / 100));
            const rowCash = Math.round(rowBaseOriginal * ((100 - billablePercent) / 100));
            const rate = executionGstEnabled ? gstRate : 0;
            const rowGST = Math.round(rowBillable * (rate / 100));
            return Math.round(rowBillable + rowGST) + rowCash;
        }

        const rowGST = Math.round(rowBaseOriginal * (gstRate / 100));
        const rowInvoiceTotal = Math.round(rowBaseOriginal + rowGST);

        // The retainer already collected comes off the first design invoice,
        // exactly as the Money tab shows it.
        return isFirstDesign && initiationFee > 0
            ? Math.max(0, rowInvoiceTotal - initiationFee)
            : rowInvoiceTotal;
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
            // The client's badge counts what the client can see.
            const st = resolveDocumentState(context, k, { clientView: true });
            return st === 'issued' || st === 'amended';
        }).length;
    }, [context]);

    // --- ACTION REQUIRED ITEMS ---
    const pendingUpdates = displayUpdates.filter(u => u.status === 'pending_approval');
    const pendingClientDecisions = decisions.filter(d => d.status === 'proposed' || d.status === 'pending');
    // What the outstanding decisions are worth, together.
    const pendingDecisionCost = pendingClientDecisions.reduce((sum, d) => sum + (Number(d.impactCost) || 0), 0);
    
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
            if (!isVisibleToClient(suAny)) return;
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
            if (!isVisibleToClient(mom)) return;
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
            if (!isVisibleToClient(v)) return;
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
            if (!isVisibleToClient(sv)) return;
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
    /**
     * Client approves a decision.
     *
     * The decision ledger in Firestore is the source of truth — the studio's
     * Decisions table reads it directly, and `projectDecisions` here is only a
     * projection of it. Flipping the projection alone (which is all this used to
     * do) left the studio still seeing the decision as awaiting the client, and
     * the next projection refresh overwrote the approval entirely. So write to
     * the ledger first, then update locally for immediate feedback.
     *
     * An unauthenticated client goes through the signoff token, which is the
     * only path Firestore rules allow them; the studio's own portal view is
     * authenticated and records a manual sign-off instead.
     */
    /**
     * Carry out whatever a client action asks for.
     *
     * Defined at component scope because both the overview and the approvals
     * hub offer the same actions — when this lived inside the approvals tab,
     * the overview could only link across to it rather than act.
     */
    /**
     * The spine's contents: every real record on this project, hung off the
     * stage it belongs to. Built here rather than inside the overview so the
     * lens bar can count what a filter would show before the filter is used.
     *
     * The action callbacks are captured lazily — they are declared below this
     * point and only ever run from a click.
     */
    /**
     * The project's real dated programme — the same schedule the studio's own
     * Timeline tab draws, which this portal was already loading into
     * `clientSchedule` and then ignoring. Both the spine's month column and the
     * Gantt read it, so the two can never disagree.
     */
    const programme = useMemo(
        // Real dates, not ours to move, whenever the schedule is anchored to
        // something the studio set — a saved schedule, or design phases with
        // their own start dates.
        () => buildProgramme(clientSchedule, lifecycleInfo, !!customSchedule || designPhases.length > 0),
        [clientSchedule, customSchedule, designPhases, lifecycleInfo],
    );

    /**
     * Drawings, grouped into revision sets.
     *
     * `designDocuments` is a flat array — re-issuing "Living Room OP1" simply
     * appends another row, so the client saw two entries with the same name and
     * no way to tell which one was current. Grouping by room + title turns that
     * into a revision chain from data that was already there: newest is the live
     * sheet, the rest are history.
     *
     * This is deliberately derived rather than stored. Giving drawings real
     * DocumentIssues would also give them the redline and the re-approval flow,
     * but that needs a release action on the ops side; until then, showing the
     * revisions that exist beats pretending each upload is a separate drawing.
     */
    const drawingSets = useMemo(() => {
        /*
          Published only. Nothing reaches a client by default.

          This briefly grandfathered anything without a visibility state, on the
          reasoning that records predating the gate should stay put. The studio's
          rule is the opposite and it is the safer one: ops decides what a client
          sees, every time, and an un-migrated record is not a decision. Existing
          drawings become visible the moment ops runs "Publish everything up to
          today", which is one click and leaves an audit trail.
        */
        const visible = (context.designDocuments || []).filter(isVisibleToClient as any);
        const groups = new Map<string, any[]>();
        visible.forEach((d: any) => {
            const key = `${(d.roomName || 'Overall').trim().toLowerCase()}|${(d.title || 'Drawing').trim().toLowerCase()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(d);
        });
        return [...groups.values()]
            .map(items => {
                const ordered = [...items].sort(
                    (a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
                return {
                    key: ordered[0].id || ordered[0].title,
                    current: ordered[0],
                    older: ordered.slice(1),
                    revision: ordered.length,
                    roomName: ordered[0].roomName || 'Overall',
                    title: ordered[0].title || 'Drawing',
                };
            })
            .sort((a, b) =>
                new Date(b.current.addedAt || 0).getTime() - new Date(a.current.addedAt || 0).getTime());
    }, [context.designDocuments]);

    const spinePhases = useMemo(() => buildSpine({
        context,
        lifecycle: lifecycleInfo,
        programme,
        milestones,
        decisions,
        milestoneAmount: calculateMilestoneTotal,
        clientActions: clientActionSummary.clientActions,
        onRunAction: (item) => runClientAction(item),
        onOpenDecision: () => setActiveTab('decisions'),
        onOpenDocument: (kind) => openDocument(kind),
    }), [context, lifecycleInfo, programme, milestones, decisions, clientActionSummary]);

    const catchUp = useMemo(() => buildCatchUp({
        clientActions: clientActionSummary.clientActions,
        milestones,
        milestoneAmount: calculateMilestoneTotal,
        decisions,
        context,
    }), [clientActionSummary, milestones, decisions, context]);

    /**
     * The handover month, but only when the programme actually carries one.
     * An ETA the studio has not committed to is worse than no ETA: the client
     * plans around it and the studio never agreed to it.
     */
    /**
     * Handover month, from the schedule's own target or its computed finish.
     * Absent when there is no schedule — an ETA the studio never committed to
     * is worse than none, because the client plans around it.
     */
    const handoverEta = programme.handoverLabel;

    /**
     * The portal's navigation — the five lenses from the approved design.
     *
     * The eleven that were here came from the sidebar this replaced, and most
     * were categories of the studio's filing rather than questions a client
     * asks: Approvals, Site feed, Drawings, Materials, Scope & BOQ and Roadmap
     * were all reachable at once, so the row read as a system's menu.
     *
     * Those views still exist and still hold real content — they are now
     * reached from the thing that needs them (an item in "Waiting on you", a
     * document in the file, a link from the overview) instead of being browsed.
     * Adding a lens here means claiming a client would go looking for it.
     */
    const PORTAL_LENSES: {
        id: PortalTab; label: string; badge?: () => number;
        dividerBefore?: boolean;
        /** True when the count is something the client must clear, not a total. */
        urgent?: boolean;
    }[] = [
        { id: 'overview',   label: 'Everything' },
        { id: 'timeline',   label: 'Timeline' },
        { id: 'decisions',  label: 'Decisions',  dividerBefore: true, urgent: true, badge: () => pendingClientDecisions.length },
        { id: 'documents',  label: 'Documents',  urgent: true, badge: () => documentsNeedingAttention },
        { id: 'financials', label: 'Payments',   urgent: true, badge: () => duePayments.length },
        /*
          Drawings and the approved BOQ.

          These were two tabs in the old portal and were orphaned when the lens
          bar was cut to five — the code stayed, nothing linked to it. They are
          back as one lens rather than as a group inside Documents, because a
          client looking for "what does my home look like and what am I getting"
          should not have to find it filed under paperwork.
        */
        { id: 'designScope', label: 'Design & Scope', badge: () => drawingSets.length },
    ];

    useLayoutEffect(() => {
        const track = lensTrackRef.current;
        if (!track) return;
        const measure = () => {
            const el = track.querySelector<HTMLElement>(`[data-lens="${activeTab}"]`);
            if (!el) { setLensPill(null); return; }
            const next = { left: el.offsetLeft, width: el.offsetWidth };
            setLensPill(prev =>
                prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5
                    ? prev
                    : next);
            checkNavScroll();
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(track);
        return () => ro.disconnect();
    }, [activeTab, pendingClientDecisions.length, documentsNeedingAttention, duePayments.length, drawingSets.length]);

    useEffect(() => {
        const track = lensTrackRef.current;
        if (!track) return;
        checkNavScroll();
        const onScroll = () => checkNavScroll();
        track.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        
        // Auto scroll selected tab into view on mobile
        const el = track.querySelector<HTMLElement>(`[data-lens="${activeTab}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        return () => {
            track.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [activeTab]);

    /**
     * One lens that scopes the spine rather than replacing it.
     *
     * "Site feed" used to sit beside this one. It was a filter dressed as a
     * tab: clicking it returned you to Everything with everything that was not
     * a site update hidden, so its best case was the same page with less on it
     * — and with one update published, most stages read "Nothing of this kind
     * at this stage". It also made the bar change shape as the studio
     * published, which is hard to learn.
     *
     * Site photographs now live in the studio's Google Drive and are reached
     * from one link on Design & Scope. Site updates themselves are untouched:
     * they still appear on the spine, under the stage they belong to.
     */
    const SPINE_FILTERS = useMemo(() => {
        const count = (k: AttachmentKind) =>
            spinePhases.reduce((n, p) => n + p.attachments.filter(a => a.kind === k).length, 0);
        return ([
            { id: 'material' as AttachmentKind, label: 'Materials' },
        ]).map(f => ({ ...f, count: count(f.id) }))
          // Hidden when empty. It filters the spine, so with nothing to show it
          // greys out every stage and reads as a broken button.
          .filter(f => f.count > 0);
    }, [spinePhases]);

    const runClientAction = (item: ClientActionItem) => {
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
                /*
                  Take them to the decision rather than approving it here.
                  This button sat on a summary card that showed a title and
                  nothing else -- no drawing, no cost, no way to ask a question
                  -- so a click approved something the client had not seen.
                  The Decisions tab has all of that.
                */
                setActiveTab('decisions');
                break;
            case 'review_variation': setActiveTab('designScope'); break;
        }
    };

    const handleApproveDecisionOption = async (decisionId: string, selectedOption: string) => {
        const target = decisions.find(d => d.id === decisionId);
        const confirmedAt = new Date().toISOString();
        const clientName = projectData?.context?.clientName || 'Client';

        try {
            if (!isInternalStudioView && target?.signoffToken) {
                await recordClientSignoff(target.signoffToken, 'approved', clientName, '', '');
            } else {
                await recordManualSignoff(projectData.id, decisionId, 'approved', '');
            }
        } catch (e: any) {
            console.error('Could not record decision sign-off against the ledger', e);
            alert(
                'Your approval could not be saved. Please tell the studio rather than assuming this is approved.\n\n' +
                (e?.message || 'Unknown error')
            );
            return; // Never show it as approved when the ledger rejected the write.
        }

        setProjectContext((prev: any) => ({
            ...prev,
            projectDecisions: decisions.map(d =>
                d.id === decisionId
                    ? { ...d, status: 'confirmed' as const, selectedOption, clientConfirmedAt: confirmedAt, confirmingParty: clientName }
                    : d
            )
        }));
    };

    const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

    /**
     * The client disagrees, or wants something explained.
     *
     * Writes 'queried' to the ledger, which moves the decision to `disputed` --
     * the same state the sign-off email link produces, and the one the studio's
     * Decisions screen surfaces as "Query raised". No new plumbing: the loop
     * already existed, the portal simply never offered the door.
     */
    const handleQueryDecision = async (decisionId: string, queryText: string) => {
        const target = decisions.find(d => d.id === decisionId);
        const clientName = projectData?.context?.clientName || 'Client';
        setDecisionBusyId(decisionId);

        try {
            if (!isInternalStudioView && target?.signoffToken) {
                await recordClientSignoff(target.signoffToken, 'queried', clientName, queryText, '');
            } else {
                await recordManualSignoff(projectData.id, decisionId, 'queried', queryText);
            }
        } catch (e: any) {
            console.error('Could not record the query against the ledger', e);
            alert(
                'Your question could not be sent. Please contact the studio directly rather than assuming they have seen it. ' +
                (e?.message || 'Unknown error')
            );
            setDecisionBusyId(null);
            return;
        }

        setProjectContext((prev: any) => ({
            ...prev,
            projectDecisions: decisions.map(d =>
                d.id === decisionId ? { ...d, status: 'rejected' as const } : d
            )
        }));
        setDecisionBusyId(null);
        setSignSuccessMessage('Your question has been sent to the studio.');
        setTimeout(() => setSignSuccessMessage(null), 6000);
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
        persistClientAction({ type: 'confirmSelection', selectionId: matId });
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
        persistClientAction({ type: 'signDocument', docType: type, docket });

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
        persistClientAction({
            type: 'raiseDispute',
            kind: disputeTarget.kind,
            reason: disputeReason.trim(),
        });
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

    // The portal used to be withheld from the client until the D1 advance was
    // logged as paid. That gate locked out the very people it was built for —
    // a client signing in with the email the studio gave them hit a wall — and
    // it also held back everything the portal does that has nothing to do with
    // payment: approvals, decisions, drawings, site feed. Access is no longer
    // conditional on payment.

    return (
        <div 
            /* Column, not a row: navigation moved to the top, so a side-by-side
               container left <main> with no width and every tab rendered blank. */
            className="min-h-screen bg-slate-100/70 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900 px-2 sm:px-5"
            style={{ 
                '--color-primary': primaryThemeColor,
                '--color-accent': settings?.accentColor || '#d97706'
            } as React.CSSProperties}
        >
            {/* Studio identity and the lens bar. The navy sidebar it replaces
                took a fifth of the screen and pushed the client's own project
                below it; navigation now sits above the content it filters. */}
            {/* The portal's frame.

                The header and lens bar ran edge to edge while the hero and the
                content sat inside a max-width, so the page had three different
                left edges and no outline at all — it read as loose bands rather
                than as one application. Everything now lives inside a single
                bordered card at one width. */}
            <div className="w-full max-w-[1560px] mx-auto my-2 sm:my-6 rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_36px_rgba(15,23,42,.06)] overflow-clip">
              {/* The branding row.

                  The mark used to sit inside the dark hero, where a logo drawn
                  in dark ink simply disappeared — and it was duplicated here at
                  36px on a grey plate. It belongs on light, once, at a size
                  that can actually be read. */}
              <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 sm:py-5 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
                {/* The shared mark, resolved by the shared component.

                    This hand-rolled the lookup and checked two fields; FFDSLogo
                    checks four — orgLogo, customLogo and logoUrl — and this
                    studio's mark lives on `customLogo`, so the portal fell back
                    to initials while the same logo rendered fine everywhere
                    else in the app. Never re-implement a resolver that already
                    exists. */}
                <div className="flex items-center gap-3 min-w-0">
                  <FFDSLogo mode="icon" className="w-10 h-10 sm:w-14 sm:h-14 shrink-0" />

                  <div className="min-w-0 border-l border-slate-200 pl-3 sm:pl-4">
                    <p className="text-sm sm:text-[15px] font-extrabold text-slate-900 leading-tight truncate tracking-tight">{studioCompanyName}</p>
                    {orgData?.tagline
                      ? <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">{orgData.tagline}</p>
                      : null}
                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mt-0.5">Client portal</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {/* Where the project stands, beside the things you can do
                      about it. These sat in the lens bar for one render and the
                      chips overflowed their track and ran under the tabs — a
                      centre column sized to its content cannot defend itself
                      against two nowrap chips growing to the left of it. */}
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="hidden md:inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap"
                  >
                    Stage {lifecycleInfo.currentStageNumber} of 6 · {lifecycleInfo.currentStageName}
                  </motion.span>
                  {handoverEta && (
                    <motion.span
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.06, ease: 'easeOut' }}
                      className="hidden md:inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
                    >
                      Handover {handoverEta}
                    </motion.span>
                  )}
                  <span className="hidden md:block w-px h-5 bg-slate-200 mx-0.5" />
                  <button
                    onClick={() => { setActiveTab('overview'); setCatchOpen(o => !o); }}
                    aria-expanded={catchOpen}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {catchOpen ? 'Hide summary' : 'Catch me up'}
                  </button>
                  {/* Ops-only, and deliberately the same size as everything
                      else in this row. These two used to sit in a second
                      full-width blue bar that restated the project name, the
                      client and the code — all of which the page below already
                      says. The bar is gone; the two things it could actually do
                      are here. */}
                  {isInternalStudioView && (
                    <>
                      <span className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Studio preview
                      </span>
                      <button
                        onClick={() => setShowAddUpdateModal(true)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer"
                      >
                        Post site update
                      </button>
                      <button
                        onClick={() => setShowAddDecisionModal(true)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer"
                      >
                        Request decision
                      </button>
                      <span className="w-px h-5 bg-slate-200 mx-0.5" />
                    </>
                  )}
                  {/*
                    The link IS the credential — there is no login ID.

                    This copied `projectData.id`, which grants nothing: the
                    portal only opens on `?portal=<token>`, and an identifier a
                    client knows is deliberately not enough to get in. Ops would
                    send that id to a client expecting it to work. It also
                    showed to clients, offering them their own project id for
                    no reason. Studio-side only now, and it copies a link that
                    actually opens the portal — minting one on first use, which
                    is also how a previous link gets revoked.
                  */}
                  {isInternalStudioView && (
                    <button
                      onClick={copyClientLink}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer"
                    >
                      Copy client link
                    </button>
                  )}
                  <PWAInstallPrompt variant="pill" label="Install App" />
                  <button onClick={() => setShowContactModal(true)} className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-[#0055B3] transition-colors cursor-pointer">
                    Contact studio
                  </button>
                  {/* A real session gets a real account menu: who they are
                      signed in as, and a way to change the password their
                      studio generated for them. The studio's own preview has
                      no such session, so it keeps the plain button. */}
                  {onLogout && (source === 'client' ? (
                    <ClientAccountMenu
                      clientName={(context as any)?.clientName}
                      projectName={(context as any)?.name}
                      onSignOut={onLogout}
                    />
                  ) : (
                    <button onClick={onLogout} className="px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                      Sign out
                    </button>
                  ))}
                </div>
              </header>

              {/* The greeting sits above the lenses, as the design has it. It
                  was below them for one render and the tab row floating over a
                  dark hero looked like chrome that had come loose. */}
              <div className="px-3 sm:px-8 pt-3 sm:pt-5 pb-1 w-full">
                <PortalHero
                  clientName={(context as any).clientName}
                  attentionCount={clientActionSummary.clientActions.length}
                />
              </div>

              <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-y border-slate-200 px-1 sm:px-8 py-2 sm:py-2.5">
                <div className="relative flex items-center w-full max-w-full justify-center">
                  {/* Left scroll chevron indicator */}
                  {canScrollLeft && (
                    <button
                      onClick={() => scrollLens('left')}
                      aria-label="Scroll left"
                      className="absolute left-0 z-20 w-7 h-7 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}

                  <div
                    ref={lensTrackRef}
                    className="relative flex items-center gap-1 overflow-x-auto overflow-y-hidden rounded-xl sm:rounded-2xl bg-slate-100/90 p-1 w-full sm:w-fit sm:mx-auto ring-1 ring-slate-200/80 scrollbar-none touch-pan-x"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {lensPill && (
                      <span
                        aria-hidden="true"
                        style={{ transform: `translateX(${lensPill.left}px)`, width: `${lensPill.width}px` }}
                        className="absolute top-1 bottom-1 left-0 rounded-lg sm:rounded-xl bg-white shadow-sm ring-1 ring-slate-200
                                   pointer-events-none transition-[transform,width] duration-300 ease-out
                                   motion-reduce:transition-none"
                      />
                    )}

                    {PORTAL_LENSES.map(lens => {
                      const badge = lens.badge ? lens.badge() : 0;
                      const on = activeTab === lens.id;
                      const needsYou = !!lens.urgent && badge > 0;
                      return (
                        <React.Fragment key={lens.id}>
                          {lens.dividerBefore && <span className="w-px h-3.5 sm:h-4 bg-slate-200/80 self-center mx-0.5 sm:mx-1 shrink-0" />}
                          <button
                            onClick={(e) => {
                              setActiveTab(lens.id);
                              setSpineFilter('all');
                              (e.currentTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                            }}
                            aria-current={on ? 'page' : undefined}
                            data-lens={lens.id}
                            className={`group relative shrink-0 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-[12px] font-bold whitespace-nowrap
                                        cursor-pointer flex items-center gap-1.5 sm:gap-2 transition-colors duration-200 select-none ${
                              on ? 'text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                              {lens.label}
                              {badge > 0 && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 min-w-[18px] justify-center
                                                  text-[9px] sm:text-[10px] font-extrabold tabular-nums leading-[16px] sm:leading-[18px] ${
                                  needsYou
                                    ? 'bg-amber-100 text-amber-800'
                                    : on ? 'bg-sky-50 text-[#0055B3]' : 'bg-slate-200/70 text-slate-600'
                                }`}>
                                  {needsYou && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 portal-blink" />}
                                  {badge}
                                </span>
                              )}
                            </span>
                          </button>
                        </React.Fragment>
                      );
                    })}

                    {SPINE_FILTERS.length > 0 && <span className="w-px h-4 bg-slate-200 self-center mx-1 shrink-0" />}
                    {SPINE_FILTERS.map(f => {
                      const on = activeTab === 'overview' && spineFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={(e) => {
                            setActiveTab('overview');
                            setSpineFilter(on ? 'all' : f.id);
                            (e.currentTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                          }}
                          aria-pressed={on}
                          className={`shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-colors cursor-pointer border select-none ${
                            on ? 'bg-sky-50 text-[#0055B3] border-sky-200' : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {f.label}
                          {f.count > 0 && <span className={`ml-1 tabular-nums font-extrabold ${on ? 'text-[#0066CC]' : 'text-slate-400'}`}>{f.count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right scroll chevron indicator */}
                  {canScrollRight && (
                    <button
                      onClick={() => scrollLens('right')}
                      aria-label="Scroll right"
                      className="absolute right-0 z-20 w-7 h-7 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </nav>


            {showBoqVersions && (
                <BoqVersionCompare
                    tiers={tiers as any}
                    bankMap={boqBankMap}
                    approvedTierId={context.approvedTierId}
                    activeTierId={projectData.activeTierId}
                    revisions={context.boqRevisions}
                    onClose={() => setShowBoqVersions(false)}
                />
            )}

            {questionFor && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQuestionFor(null)}>
                    <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-slate-900">Ask about this document</h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                            Your studio sees the question against the document and replies here. Nothing is signed by asking.
                        </p>
                        <textarea
                            autoFocus
                            value={questionText}
                            onChange={e => setQuestionText(e.target.value)}
                            rows={4}
                            placeholder="What would you like to know?"
                            className="w-full mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-300"
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <button
                                onClick={() => { setQuestionFor(null); setQuestionText(''); }}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={!questionText.trim()}
                                onClick={() => {
                                    const issue = getCurrentIssue(context, questionFor, { clientView: true });
                                    setProjectContext(raiseQuery({
                                        issueId: issue?.id || `pending-${questionFor}`,
                                        documentKind: questionFor,
                                        clauseRef: 'General',
                                        clauseExcerpt: '',
                                        question: questionText.trim(),
                                        raisedBy: context.clientName || 'Client',
                                    }));
                                    persistClientAction({
                                        type: 'raiseQuery',
                                        issueId: issue?.id || `pending-${questionFor}`,
                                        documentKind: questionFor,
                                        clauseRef: 'General',
                                        clauseExcerpt: '',
                                        question: questionText.trim(),
                                    });
                                    setQuestionFor(null);
                                    setQuestionText('');
                                    setSignSuccessMessage('Your question has been sent to the studio.');
                                    setTimeout(() => setSignSuccessMessage(null), 8000);
                                }}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0066CC] text-white hover:bg-[#0055B3] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                Send question
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Workspace Area */}
            <main className="flex-1 overflow-y-auto flex flex-col">
                {/* Two bars used to sit here and both have gone.

                    The first was a blue "Studio Workspace View — Client Portal
                    Live Mirror & Control Panel" strip carrying Copy Login ID,
                    Post Site Update and Request Decision. That is ops chrome
                    painted across the client's own screen; the two controls it
                    alone could reach are now in the portal header, shown only
                    to studio users.

                    The second restated the project name, an "Active Execution"
                    pill, the client's name and the project code — directly
                    above a page whose first three lines are the studio name,
                    the project name and the current stage. Studio PM Support
                    duplicated "Contact studio" in the header; Bank Details &
                    UPI now sits in Payments, beside the amounts it is for. */}

                {/* Main Content Area.
                    max-w-6xl held this to 1152px and left ~350px of empty grey
                    down each side of a widescreen — the programme chart and
                    the tables were scrolling sideways inside a column narrower
                    than the window. */}
                <div className="px-3 sm:px-8 py-5 sm:py-8 w-full space-y-6 sm:space-y-8 flex-1">

                    {/* A view reached by acting on something, not by choosing a
                        lens. Without this the nav highlights nothing and there
                        is no way back except the browser. */}
                    {!PORTAL_LENSES.some(l => l.id === activeTab) && (
                        <button
                            onClick={() => setActiveTab('overview')}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0055B3] transition-colors cursor-pointer -mb-3"
                        >
                            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                            Back to overview
                        </button>
                    )}

                    {/* Tab Content Router */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                            >
                                <PortalOverview
                                    clientName={(context as any).clientName}
                                    studio={{
                                        name: studioCompanyName,
                                        tagline: orgData?.tagline,
                                        // Falls back to the strapline only when
                                        // no description has been written.
                                        about: orgData?.about || orgData?.tagline,
                                        address: [orgData?.officeAddress, orgData?.cityState].filter(Boolean).join(', ') || undefined,
                                        phone: orgData?.contactPhone,
                                        email: orgData?.contactEmail,
                                        gstin: orgData?.gstin,
                                        logoUrl: (settings as any)?.logoUrl || orgData?.orgLogo,
                                        pmName: orgData?.signatoryName,
                                        pmRole: orgData?.signatoryTitle,
                                        website: orgData?.website,
                                        instagramUrl: orgData?.instagramUrl,
                                        instagramQr: orgData?.instagramQr,
                                        businessHours: orgData?.businessHours,
                                        siteVisitPolicy: orgData?.siteVisitPolicy,
                                        escalationPolicy: orgData?.escalationPolicy,
                                        credentials: orgData?.credentials,
                                        pmResponseTime: orgData?.pmResponseTime,
                                    }}
                                    lifecycle={lifecycleInfo}
                                    actions={clientActionSummary}
                                    phases={spinePhases}
                                    filter={spineFilter}
                                    catchOpen={catchOpen}
                                    catchUp={catchUp}
                                    onClearFilter={() => setSpineFilter('all')}
                                    projectValue={currentProjectValue}
                                    totalPaid={totalPaid}
                                    balanceDue={balanceDue}
                                    overdueCount={duePayments.length}
                                    onOpenTab={setActiveTab}
                                    onRunAction={runClientAction}
                                    onContactStudio={() => setShowContactModal(true)}
                                    successMessage={signSuccessMessage}
                                    onDismissSuccess={() => setSignSuccessMessage(null)}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'timeline' && (
                            <motion.div key="timeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Your programme</h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Work, the decisions we need from you, and when payments fall — on one timeline.
                                    </p>
                                </div>
                                <PortalTimeline
                                    programme={programme}
                                    milestones={milestones}
                                    decisions={decisions}
                                    milestoneAmount={calculateMilestoneTotal}
                                    stageOfMilestone={(m, i) => stageOfMilestone(m, i, lifecycleInfo.currentStageNumber)}
                                />
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
                                            { id: 'payments', label: 'Payments' },
                                            { id: 'decisions', label: 'Decisions' },
                                        ].map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setFeedCategoryFilter(f.id as any)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                                    feedCategoryFilter === f.id 
                                                        ? 'bg-[#0066CC] text-white shadow-xs' 
                                                        : 'bg-slate-100 hover:bg-sky-50 text-slate-700'
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

                                                {/* An approval with no time on it is not a record of
                                                    anything. Show who confirmed and when. */}
                                                {item.type === 'decision' && item.status === 'confirmed' && (
                                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5 text-[11px] font-bold text-emerald-700">
                                                        <Check className="w-3.5 h-3.5" />
                                                        <span>
                                                            Approved{item.data?.confirmingParty ? ` by ${item.data.confirmingParty}` : ''}
                                                            {item.data?.clientConfirmedAt
                                                                ? ` · ${new Date(item.data.clientConfirmedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                                                                : ''}
                                                        </span>
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
                        {activeTab === 'designScope' && (
                          <div className="flex gap-1 rounded-2xl bg-slate-50 p-1 w-fit ring-1 ring-slate-200/70 mb-5">
                            {([
                              { id: 'drawings' as const, label: 'Drawings & renders', n: drawingSets.length },
                              { id: 'scope' as const, label: 'Scope & BOQ', n: 0 },
                            ]).map(t => {
                              const on = designScopeTab === t.id;
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setDesignScopeTab(t.id)}
                                  aria-current={on ? 'page' : undefined}
                                  className={`px-3.5 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                                    on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                       : 'text-slate-500 hover:text-slate-900 hover:bg-white/70'
                                  }`}
                                >
                                  {t.label}
                                  {t.n > 0 && (
                                    <span className={`inline-flex items-center rounded-full px-1.5 min-w-[20px] justify-center text-[10px] font-extrabold tabular-nums leading-[18px] ${
                                      on ? 'bg-sky-50 text-[#0055B3]' : 'bg-slate-100 text-slate-500'
                                    }`}>{t.n}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {activeTab === 'designScope' && designScopeTab === 'drawings' && (
                            <motion.div
                                key="designs"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/*
                                  Site photographs, where they actually live.

                                  The portal used to carry a "Site feed" lens
                                  that hid everything on the project spine
                                  except site updates — a filter dressed as a
                                  tab, whose best case was the same page with
                                  less on it. The album belongs in Drive, which
                                  does ordering, full resolution and download
                                  properly. Shown only when the studio has set
                                  a link.
                                */}
                                {context.sitePhotosLink?.url && (
                                    <a
                                        href={context.sitePhotosLink.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-center gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs hover:border-sky-200 hover:shadow-md transition-all"
                                    >
                                        <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 text-[#0066CC] flex items-center justify-center shrink-0">
                                            <Camera className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-black text-slate-900 text-base tracking-tight">
                                                {context.sitePhotosLink.label || 'Site progress photos'}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                                                Photographs from site, kept in a shared Google Drive album so you can view
                                                and download them at full resolution. Opens in a new tab.
                                            </p>
                                        </div>
                                        <span className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-[#0066CC] shrink-0 whitespace-nowrap">
                                            Open album
                                            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                        </span>
                                    </a>
                                )}

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
                                        /* Filter the revision SETS, so a sheet
                                           re-issued three times is one card
                                           showing Rev 3 — not three cards with
                                           the same name and no way to tell which
                                           one the studio is working to. */
                                        const filteredSets = drawingSets.filter(set => {
                                            const doc: any = set.current;
                                            if (designTypeFilter !== 'all') {
                                                const dt = doc.docType || '3d_render';
                                                if (dt !== designTypeFilter) return false;
                                            }
                                            if (designRoomFilter !== 'all' && doc.roomName !== designRoomFilter) {
                                                return false;
                                            }
                                            return true;
                                        });
                                        const filteredDocs = filteredSets.map(x => x.current);

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
                                                {filteredSets.map((set) => {
                                                    const doc: any = set.current;
                                                    const isImg = doc.thumbnailUrl || (doc.url && doc.url.match(/\.(jpeg|jpg|png|webp|avif)/i));
                                                    const docType = doc.docType || '3d_render';

                                                    return (
                                                        <div key={set.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden group shadow-2xs hover:shadow-md transition-all flex flex-col relative">
                                                            {set.revision > 1 && (
                                                                <span className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-full bg-slate-900/85 text-white text-[10px] font-bold backdrop-blur-xs">
                                                                    Rev {set.revision}
                                                                </span>
                                                            )}
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
                                                                    'bg-[#0055B3] text-white'
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

                                                                {/* The history, stated but not in the way.
                                                                    A client needs to know a sheet was revised —
                                                                    and that the one they are looking at is the
                                                                    current one. */}
                                                                {set.older.length > 0 && (
                                                                    <details className="group/rev">
                                                                        <summary className="list-none cursor-pointer text-[10px] font-bold text-slate-400 hover:text-[#0055B3] transition-colors flex items-center gap-1">
                                                                            <ChevronRight className="w-3 h-3 transition-transform group-open/rev:rotate-90" />
                                                                            {set.older.length} earlier {set.older.length === 1 ? 'version' : 'versions'}
                                                                        </summary>
                                                                        <ul className="mt-1.5 space-y-1 pl-4 border-l border-slate-100">
                                                                            {set.older.map((old: any, oi: number) => (
                                                                                <li key={old.id || oi} className="flex items-center justify-between gap-2">
                                                                                    <a
                                                                                        href={old.url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-[10px] font-semibold text-slate-500 hover:text-[#0055B3]"
                                                                                    >
                                                                                        Rev {set.revision - 1 - oi}
                                                                                    </a>
                                                                                    <span className="text-[10px] text-slate-400 tabular-nums">
                                                                                        {old.addedAt ? new Date(old.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                                                                                    </span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </details>
                                                                )}
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
                        {/* Decisions. This tab used to fall through to the
                            Approvals Centre below — clicking "Decisions" showed
                            a sign-off console reporting 0 items, so the project's
                            actual decision record was never on screen anywhere.
                            It now reads `context.projectDecisions`, the same
                            array the studio's Decision Tracker writes to, with
                            the client's own sign-off timestamps. */}
                        {activeTab === 'decisions' && (
                            <motion.div
                                key="decisions"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-4"
                            >
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Your decisions</h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Every choice we have asked you for, what you decided, and when.
                                    </p>
                                </div>

                                {pendingClientDecisions.length > 0 && (
                                    <div className="space-y-3">
                                        {/* The headline carries the money as well as the count.
                                            "2 decisions waiting" and "2 decisions waiting, ₹8,000
                                            between them" are different sentences to be read by
                                            somebody deciding whether to open the tab. */}
                                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[11px] font-bold text-amber-800 flex flex-wrap gap-x-2">
                                            <span>
                                                {pendingClientDecisions.length === 1
                                                    ? 'One decision is waiting on you'
                                                    : `${pendingClientDecisions.length} decisions are waiting on you`}
                                            </span>
                                            {pendingDecisionCost > 0 && (
                                                <span className="font-black">
                                                    · {formatINR(pendingDecisionCost)} riding on them
                                                </span>
                                            )}
                                        </div>

                                        {/* One card per decision, not one panel with hairlines
                                            between. Each card now carries a thread, cost chips, a
                                            drawing and two buttons -- at that height a 1px divider
                                            stops reading as a boundary and the whole list looks
                                            like a single run-on document.

                                            `layout` so the survivors slide up into the gap when one
                                            is answered rather than the list snapping. */}
                                        <AnimatePresence initial={false}>
                                        {pendingClientDecisions.map((d, i) => (
                                            <motion.div
                                                key={d.id}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.98, height: 0, marginBottom: 0 }}
                                                transition={{
                                                    duration: 0.3,
                                                    ease: [0.22, 1, 0.36, 1],
                                                    delay: Math.min(i, 5) * 0.04,
                                                }}
                                                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs hover:border-slate-300 hover:shadow-sm transition-[border-color,box-shadow] duration-200"
                                            >
                                                <ClientDecisionCard
                                                    decision={d}
                                                    nature={decisionNature(d as any, lifecycleInfo.currentStageNumber)}
                                                    busy={decisionBusyId === d.id}
                                                    onApprove={() => handleApproveDecisionOption(d.id, 'Confirmed by client')}
                                                    onQuery={(text) => handleQueryDecision(d.id, text)}
                                                />
                                            </motion.div>
                                        ))}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <DecisionsTable decisions={decisions} stageNumber={lifecycleInfo.currentStageNumber} />
                            </motion.div>
                        )}

                        {activeTab === 'approvals' && (
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
                                            { id: 'all', label: 'Everything', count: clientActionSummary.allActions.length, tone: 'bg-[#0066CC] text-white' },
                                            { id: 'agreements', label: 'Agreements', count: clientActionSummary.agreementsPending.length, tone: 'bg-amber-600 text-white', icon: FileText },
                                            { id: 'payments', label: 'Payments', count: clientActionSummary.paymentsPending.length, tone: 'bg-rose-600 text-white', icon: Wallet },
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
                                                                        onClick={() => runClientAction(item)}
                                                                        className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                                                            isCritical
                                                                                ? 'bg-[#0066CC] hover:bg-[#0055B3] text-white'
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
                                    onAskQuestion={(kind) => setQuestionFor(kind)}
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
                        {activeTab === 'designScope' && designScopeTab === 'scope' && (
                            <motion.div
                                key="scope"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/*
                                  The scope header.

                                  What stood here was a blue marketing band —
                                  "Zero Hidden Charges", "Factory Precision",
                                  "Turnkey Delivery" — in a gradient and a
                                  typeface used nowhere else in this portal. It
                                  read as a slide pasted in from a pitch deck,
                                  and worse, it made three promises the app
                                  cannot stand behind: nothing here knows what a
                                  rate includes, whether joinery is factory-made,
                                  or that a QA handover happened.

                                  A BOQ earns trust by being checkable, not by
                                  asserting it is honest. So: the figure, what it
                                  covers, which version it is, and when it was
                                  approved.
                                */}
                                <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                                  <div className="flex flex-wrap items-start justify-between gap-5">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-bold text-slate-900">Scope &amp; pricing</h3>
                                        {/* Only a frozen BOQ is an approved one.
                                            Until the studio freezes it, what the client is reading is
                                            the working tier — it can change under them, and saying
                                            "Approved" over it would be the same kind of false comfort
                                            as the marketing band this replaced. */}
                                        {context.operativeBoqVersion ? (
                                          <>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                                              Approved
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 tabular-nums">
                                              Rev {context.operativeBoqVersion}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                                            Not yet frozen
                                          </span>
                                        )}

                                        {/* The revision history.
                                            A revision is the moment a client most
                                            needs to trust the studio, and the portal
                                            used to swap one BOQ for another with no
                                            account of what moved. */}
                                        {boqVersions.length > 1 && (
                                          <button
                                            onClick={() => setShowBoqVersions(true)}
                                            className="text-[10px] font-bold uppercase tracking-wider text-[#0055B3] bg-sky-50 border border-sky-200 rounded-md px-2 py-0.5 hover:bg-sky-100 transition-colors cursor-pointer"
                                          >
                                            {boqVersionSet.mode === 'revisions'
                                              ? `${boqVersions.length} versions · see what changed`
                                              : `${boqVersions.length} packages · compare`}
                                          </button>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 font-medium mt-1.5 max-w-2xl leading-relaxed">
                                        Every line the studio is building, with its quantity, unit rate and total.
                                        {context.operativeBoqVersion
                                          ? 'This is the version your agreement is priced against — if it changes, you will be asked to approve the change before it is built.'
                                          : 'Your studio is still working on this scope, so quantities and rates can still move. Once it is frozen you will be asked to approve it, and any change after that comes back to you.'}
                                      </p>
                                    </div>

                                    <div className="text-right shrink-0">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
                                        Approved scope value
                                      </p>
                                      <p className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                                        {formatINR(totalScopeValue)}
                                      </p>
                                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5 tabular-nums">
                                        {flatBoqList.length} items across {allBoqRooms.length} rooms
                                      </p>
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
                                                        ? 'bg-[#0066CC] text-white border-[#0066CC] shadow-xs'
                                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span>All Rooms</span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${boqRoomFilter === 'all' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
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
                                                        /* Clause text is searchable as well — "excludes
                                                           electrical" is exactly the kind of thing a client
                                                           opens this tab to look for. */
                                                        const clauses = [...(item.inclusions || []), ...(item.exclusions || [])]
                                                            .join(' ')
                                                            .toLowerCase();
                                                        const matchClause = clauses.includes(q);
                                                        if (!matchItem && !matchDesc && !matchRoom && !matchTrade && !matchClause) return false;
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
                                                                                            <td className="px-4 py-3.5 align-top">
                                                                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                                                                    <p className={`font-bold text-xs ${
                                                                                                        item.change?.type === 'removed'
                                                                                                            ? 'text-slate-400 line-through'
                                                                                                            : 'text-slate-900'
                                                                                                    }`}>{item.item}</p>
                                                                                                    {/* Provenance, not commercial state. A line
                                                                                                        approved yesterday and one in the contract
                                                                                                        since day one both read "Approved" in the
                                                                                                        status column — true, and useless for
                                                                                                        spotting what moved. */}
                                                                                                    {item.change && (
                                                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider border ${
                                                                                                            item.change.type === 'added'
                                                                                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                                                                                : item.change.type === 'removed'
                                                                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                                                                    : 'bg-sky-50 text-[#0055B3] border-sky-200'
                                                                                                        }`}>
                                                                                                            {item.change.type === 'added'
                                                                                                                ? 'New'
                                                                                                                : item.change.type === 'removed'
                                                                                                                    ? 'Removed from scope'
                                                                                                                    : item.change.type === 'replaced'
                                                                                                                        ? 'Substituted'
                                                                                                                        : 'Revised'}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                {/* What it was, when the log recorded it — a
                                                                                                    "Revised" tag with no previous figure asks the
                                                                                                    client to take the change on trust. */}
                                                                                                {item.change?.from && (item.change.from.qty !== undefined || item.change.from.rate !== undefined) && (
                                                                                                    <p className="text-[10.5px] text-slate-500 mt-1">
                                                                                                        {item.change.type === 'removed'
                                                                                                            ? `Was ${item.change.from.qty} ${item.unit} at ${formatINR(item.change.from.rate)}`
                                                                                                            : item.change.from.qty !== undefined
                                                                                                                ? `Was ${item.change.from.qty} ${item.unit}`
                                                                                                                : `Was ${formatINR(item.change.from.rate)} per ${item.unit}`}
                                                                                                        {item.change.at ? ` · ${new Date(item.change.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                                                                                                    </p>
                                                                                                )}
                                                                                                {/* The boundaries of the line, not decoration: the
                                                                                                    agreement makes inclusions and exclusions part of
                                                                                                    the BOQ, so a client approving a price should be
                                                                                                    able to see what it does and does not cover. */}
                                                                                                {!!(item.inclusions?.length || item.exclusions?.length) && (
                                                                                                    <div className="mt-1.5 space-y-1 max-w-[420px]">
                                                                                                        {item.inclusions?.length > 0 && (
                                                                                                            <p className="text-[10.5px] leading-relaxed text-slate-500">
                                                                                                                <span className="font-black uppercase tracking-wider text-emerald-700">Includes</span>
                                                                                                                <span className="mx-1.5 text-slate-300">·</span>
                                                                                                                {item.inclusions.join(' · ')}
                                                                                                            </p>
                                                                                                        )}
                                                                                                        {item.exclusions?.length > 0 && (
                                                                                                            <p className="text-[10.5px] leading-relaxed text-slate-500">
                                                                                                                <span className="font-black uppercase tracking-wider text-rose-700">Excludes</span>
                                                                                                                <span className="mx-1.5 text-slate-300">·</span>
                                                                                                                {item.exclusions.join(' · ')}
                                                                                                            </p>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
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
                                                                                                {item.change?.type === 'removed' ? (
                                                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                                                                                                        Removed
                                                                                                    </span>
                                                                                                ) : isAdded ? (
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

                                                        {/* The total.
                                                            Was the same blue gradient as the header band, with
                                                            "branded fittings" — a claim nothing in the data
                                                            supports. It is a sum; it should look like one. */}
                                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 flex items-center justify-between gap-4 flex-wrap">
                                                            <div>
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                                    Total scope value
                                                                </p>
                                                                <p className="text-[11px] text-slate-500 font-medium mt-0.5 tabular-nums">
                                                                    {flatBoqList.length} items across {allBoqRooms.length} rooms
                                                                </p>
                                                            </div>
                                                            <p className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
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
                                <PortalPayments
                                    milestones={milestones}
                                    amountOf={calculateMilestoneTotal}
                                    projectValue={currentProjectValue}
                                    totalPaid={totalPaid}
                                    balanceDue={balanceDue}
                                    dueCount={duePayments.length}
                                    design={{
                                        total: totalDesignValue,
                                        taxable: taxableDesign,
                                        paid: designPaid,
                                        pct: designPaidPercentage,
                                    }}
                                    execution={{
                                        total: totalExecutionValue,
                                        taxable: taxableExecution,
                                        paid: executionPaid,
                                        pct: executionPaidPercentage,
                                    }}
                                    onContactStudio={() => setActiveTab('overview')}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
            </div>

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
                                className="w-full py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
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
                                    className="w-full sm:w-1/2 py-3 bg-[#0066CC] hover:bg-[#0055B3] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
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
                        if (docket.issueId) {
                            setProjectContext(signIssue(docket.issueId, docket));
                            persistClientAction({ type: 'signIssue', issueId: docket.issueId, docket });
                        }
                        const issue = getCurrentIssue(context, readingRoomKind, { clientView: true });
                        const isAddendum = !!issue && docket.issueId !== issue.id;
                        const agreement = agreementKindFor(readingRoomKind);
                        if (agreement && !isAddendum) handleSignDocComplete(docket, agreement);
                        setReadingRoomKind(null);
                        setReadingRoomIssueId(undefined);
                    }}
                    onRaiseQuery={(clauseRef, excerpt, question) => {
                        const issue = getCurrentIssue(context, readingRoomKind, { clientView: true });
                        if (!issue) return;
                        setProjectContext(raiseQuery({
                            issueId: issue.id,
                            documentKind: readingRoomKind,
                            clauseRef,
                            clauseExcerpt: excerpt,
                            question,
                            raisedBy: context.clientName || 'Client'
                        }));
                        persistClientAction({
                            type: 'raiseQuery',
                            issueId: issue.id,
                            documentKind: readingRoomKind,
                            clauseRef,
                            clauseExcerpt: excerpt,
                            question,
                        });
                        /*
                          The reading room stays open. Closing it on send threw
                          the client out of the document the moment they asked
                          about it — so they could not read on, and the mark now
                          sitting on that clause was never seen.
                        */
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
