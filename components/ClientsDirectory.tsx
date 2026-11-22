import React, { useState, useMemo, useRef, useEffect } from "react";
import { FullProjectData } from "../types";
import { classifyProject } from "../lib/projectClassification";
import { formatINR, timeAgo } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "../contexts/OrgContext";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { db } from "../services/dbService";
import { issuePortalAccess, PortalAccess, portalTokenOf } from "../services/portalAccessService";
import { httpsCallable } from "firebase/functions";
import { functions as fbFunctions } from "../services/firebaseClient";
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  MessageCircle, 
  Download, 
  Tag, 
  Building, 
  Star, 
  Clock, 
  Eye, 
  X, 
  LayoutGrid, 
  List, 
  Send, 
  Globe,
  KeyRound,
  Check,
  RefreshCw,
  AlertTriangle,
} from '@/lib/lucide-shim';
import { publicAppOrigin } from "../lib/publicUrl";
import { Button, Chip, Segmented, StateDot, EmptyState, LABEL, INPUT, type Tone } from "./ui/kit";
import { CountUp } from "./ui/HudBits";

interface ClientsDirectoryProps {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onCreateNew: () => void;
}

type BucketType = 'all' | 'active' | 'pipeline' | 'delivered' | 'lost';
type ProjectKindFilter = 'all' | 'actual' | 'dummy';
type SortOption = 'activity_desc' | 'value_desc' | 'projects_desc' | 'name_asc';
type SmartFilterTag = 'all' | 'vip' | 'multiproject' | 'execution' | 'followup' | 'recent' | 'invoice_pending';

interface ClientNote {
  id: string;
  text: string;
  createdAt: number;
  author: string;
}

interface AggregatedClient {
  clientKey: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientLocation: string;
  projects: FullProjectData[];
  totalValue: number;
  lastActivity: number;
  daysIdle: number;
  bucket: 'pipeline' | 'active' | 'delivered' | 'lost';
  isVip: boolean;
  isMultiProject: boolean;
  hasActiveSite: boolean;
  hasPendingInvoices: boolean;
  isRecent: boolean;
  needsFollowup: boolean;
  isDummy: boolean;
  configs: string[];
}

/* A status is a chip from the screen kit: brand, slate, or one of the three state colours. */
const BUCKET_CONFIG: Record<BucketType, { label: string; tone: Tone }> = {
  all: { label: "All accounts", tone: "slate" },
  active: { label: "Active site", tone: "brand" },
  pipeline: { label: "In pipeline", tone: "warn" },
  delivered: { label: "Delivered", tone: "good" },
  lost: { label: "Dormant", tone: "slate" },
};

const PROJECT_STATUS_CONFIG: Record<string, { label: string; tone: Tone }> = {
  lead: { label: "Discovery", tone: "slate" },
  draft: { label: "Drafting", tone: "slate" },
  proposal_sent: { label: "Proposal", tone: "warn" },
  negotiation: { label: "Negotiation", tone: "warn" },
  won: { label: "Contracted", tone: "brand" },
  execution: { label: "On site", tone: "brand" },
  work_paused: { label: "Paused", tone: "bad" },
  completed: { label: "Handed over", tone: "good" },
  lost: { label: "Lost", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
};

/* The content card, the figure and the roster's columns (DESIGN.md "Surfaces" and "Type"). */
const CARD = "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in min-w-0";
const FIGURE = "text-2xl leading-none font-black text-slate-800 tabular-nums";
/* The last column holds five 28px actions; at 116px they sat on top of the figure beside them. */
const ROW_GRID = "lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)_112px_minmax(0,1.4fr)_128px_164px]";

const LIFECYCLE_STAGES = [
  { id: 1, label: "Consult", short: "1. Brief" },
  { id: 2, label: "Scope", short: "2. Scope" },
  { id: 3, label: "Proposal", short: "3. Pitch" },
  { id: 4, label: "Agreement", short: "4. Sign" },
  { id: 5, label: "Execution", short: "5. Build" },
  { id: 6, label: "Handover", short: "6. Done" },
];

const WHATSAPP_TEMPLATES = [
  {
    id: "update",
    title: "Site & Design Update",
    template: (clientName: string, studioName: string, projectName: string) => 
      `Hi ${clientName}, greetings from ${studioName}! Sharing a quick progress update regarding your ${projectName} interior project.`
  },
  {
    id: "review",
    title: "Drawings / BOQ Review",
    template: (clientName: string, studioName: string, projectName: string) => 
      `Hi ${clientName}, we've prepared the latest drawing set and BOQ specifications for ${projectName}. Let us know when convenient to review together.`
  },
  {
    id: "milestone",
    title: "Payment Milestone Check-in",
    template: (clientName: string, studioName: string, projectName: string) => 
      `Hi ${clientName}, sharing the milestone update and statement for ${projectName}. Please let us know if you need any clarification on the items.`
  },
  {
    id: "touchpoint",
    title: "General Studio Follow-up",
    template: (clientName: string, studioName: string, projectName: string) => 
      `Hi ${clientName}, checking in from ${studioName} regarding ${projectName}. Let's connect this week to discuss next steps.`
  }
];

export default function ClientsDirectory({ projects, onOpenProject, onCreateNew }: ClientsDirectoryProps) {
  const { orgData, currentRole, currentUserAuth } = useOrg();
  /* Other clients' account values: hidden from a Designer. Hiding figures hides margins only, and this screen shows none. */
  const isDesigner = currentRole === 'Designer';

  const [selectedBucket, setSelectedBucket] = useState<BucketType>('all');
  /* Opens on the real book. Sample projects are something you ask for. */
  const [selectedProjectKind, setSelectedProjectKind] = useState<ProjectKindFilter>('actual');
  const [selectedSmartTag, setSelectedSmartTag] = useState<SmartFilterTag>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersAt, setFiltersAt] = useState<{ top: number; left: number } | null>(null);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const [sortBy, setSortBy] = useState<SortOption>('activity_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /*
    A client login is an email and a password the studio issues -- the portal
    link on its own is no longer a way in. Creating the account has to happen
    server-side: the client SDK's createUserWithEmailAndPassword switches the
    signed-in user, so doing it here would sign the studio out of their own
    account every time they set a client up.
  */
  const [issuingLoginFor, setIssuingLoginFor] = useState<string | null>(null);
  const [issuedLogin, setIssuedLogin] = useState<
    { email: string; tempPassword: string; clientName: string; reissued: boolean } | null
  >(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handleIssueClientLogin = async (
    project: FullProjectData,
    clientName: string,
    reissue: boolean,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    const email = (project.context as any)?.clientEmail?.split(",")[0]?.trim();
    if (!email) {
      setLoginError("Add a client email to this project first — it is their username.");
      return;
    }
    if (!fbFunctions) {
      setLoginError("Cannot reach the server. Check your connection and try again.");
      return;
    }

    setLoginError(null);
    setIssuingLoginFor(project.id);
    try {
      const fn = httpsCallable(fbFunctions, reissue ? "resetClientPassword" : "createClientLogin");
      const res: any = await fn({
        email,
        projectId: project.id,
        tenantId: orgData?.tenantId || "demo-tenant-01",
        clientName,
      });
      setIssuedLogin({
        email: res?.data?.email || email,
        tempPassword: res?.data?.tempPassword || "",
        clientName,
        reissued: reissue,
      });
      setCopiedPassword(false);
    } catch (err: any) {
      setLoginError(err?.message || "Could not create the login. Please try again.");
    } finally {
      setIssuingLoginFor(null);
    }
  };

  /*
    The portal link is `?portal=<token>`, never `?portal=<projectId>`.

    The token is `${projectId}_${random}`, and `projectIdFromToken` splits on the
    last underscore to extract the project ID for verification.
    If no active token exists or it has expired, mint and persist a new one via
    `issuePortalAccess` so copying always produces an authentic, functional link.
  */
  const handleCopyPortalUrl = async (projectId: string, e?: React.MouseEvent, forceNew: boolean = false) => {
    if (e) e.stopPropagation();
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      setCopiedId("noportal-" + projectId);
      setTimeout(() => setCopiedId(null), 3000);
      return;
    }

    // Links do not expire; a new one is minted only on Reissue, or when none exists.
    const existing = portalTokenOf(project.context);
    const live = !forceNew && !!existing;

    let token = existing || undefined;
    if (!live || forceNew) {
      const access = issuePortalAccess(project.id, (project.context as any)?.clientEmail);
      token = access.token;
      const updatedProject: FullProjectData = {
        ...project,
        context: { ...(project.context as any), portalAccess: access },
        lastModified: Date.now(),
      };
      try {
        await db.saveProject(updatedProject);
      } catch (err) {
        console.error("Could not persist portal access token:", err);
      }
    }

    const origin = publicAppOrigin();
    const url = `${origin}/?portal=${token}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopiedId((forceNew ? "newportal-" : "portal-") + projectId);
    } catch {
      setCopiedId((forceNew ? "newportal-" : "portal-") + projectId);
    }
    setTimeout(() => setCopiedId(null), 2500);
  };

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [dossierClient, setDossierClient] = useState<AggregatedClient | null>(null);
  /* The first click on Reissue Link only arms it; it lapses after five seconds. */
  const [confirmReissueFor, setConfirmReissueFor] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmReissueFor) return;
    const t = window.setTimeout(() => setConfirmReissueFor(null), 5000);
    return () => window.clearTimeout(t);
  }, [confirmReissueFor]);
  const [activeWhatsAppMenu, setActiveWhatsAppMenu] = useState<string | null>(null);

  // Client notes stored locally per client key
  const [clientNotes, setClientNotes] = useState<Record<string, ClientNote[]>>(() => {
    try {
      const saved = localStorage.getItem("ffds_client_notes");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [newNoteText, setNewNoteText] = useState("");

  const saveNotes = (updated: Record<string, ClientNote[]>) => {
    setClientNotes(updated);
    try {
      localStorage.setItem("ffds_client_notes", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save notes to local storage", e);
    }
  };

  const handleAddNote = (clientKey: string) => {
    if (!newNoteText.trim()) return;
    const author = currentUserAuth?.displayName || currentUserAuth?.email?.split('@')[0] || currentRole || "Studio Team";
    const note: ClientNote = {
      id: Math.random().toString(36).substring(2, 9),
      text: newNoteText.trim(),
      createdAt: Date.now(),
      author,
    };
    const currentNotes = clientNotes[clientKey] || [];
    const updated = { ...clientNotes, [clientKey]: [note, ...currentNotes] };
    saveNotes(updated);
    setNewNoteText("");
  };

  const handleDeleteNote = (clientKey: string, noteId: string) => {
    const currentNotes = clientNotes[clientKey] || [];
    const updated = {
      ...clientNotes,
      [clientKey]: currentNotes.filter((n) => n.id !== noteId),
    };
    saveNotes(updated);
  };

  /*
    Classification comes from lib/projectClassification, which reads the
    project's TAG and nothing else. This file kept its own copy that also
    matched "sample"/"demo"/"test"/"template" against the project name, the
    client name AND the client email -- so a real client whose email happened to
    contain "test" was filed as a sample, and this screen disagreed with Reports
    about who was real.

    A client counts as dummy only when EVERY project of theirs is tagged test
    (the `dummyCount` check below). An untagged project therefore keeps its
    client in the real directory, which is the safe direction to be wrong in.
  */
  const isDummyProject = (p: FullProjectData) => classifyProject(p) === 'test';

  // Aggregate projects by client
  const aggregatedClients = useMemo<AggregatedClient[]>(() => {
    const clientsMap = new Map<string, {
      clientKey: string;
      clientName: string;
      clientEmail: string;
      clientPhone: string;
      clientLocation: string;
      projects: FullProjectData[];
      totalValue: number;
      lastActivity: number;
      configs: Set<string>;
      hasPendingInvoices: boolean;
      hasActiveSite: boolean;
    }>();

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const ONE_WEEK_MS = 7 * ONE_DAY_MS;
    const now = Date.now();

    for (const p of projects) {
      const clientEmail = p.context?.clientEmail;
      const clientName = p.context?.clientName;

      // Skip projects without client information
      if (!clientEmail && !clientName) continue;

      /*
        Two projects are the same account only when the email AND the name
        agree.

        Keying on `clientEmail || clientName` let one address override every
        name behind it: four different people whose projects all carried the
        studio's own inbox collapsed into a single card titled with whichever
        name happened to load first, showing four unrelated projects. A
        genuine repeat client still merges; a shared inbox no longer erases
        who the client is.
      */
      const norm = (v?: string | null) => (v || '').toLowerCase().trim();
      const groupKey = `${norm(clientEmail)}|${norm(clientName)}`;
      const projectValue = getSingleProjectValue(p);
      const projectStatus = p.context?.status || 'draft';
      const projectConfig = p.context?.config;

      // Check pending invoices
      const hasPendingInvoice = p.context?.paymentMilestones?.some(
        (m) => m.status === 'invoiced' || m.status === 'pending'
      ) || false;

      // Check site execution
      const isSiteActive = projectStatus === 'execution' || projectStatus === 'work_paused';

      const existing = clientsMap.get(groupKey);
      if (existing) {
        existing.projects.push(p);
        existing.totalValue += projectValue;
        if ((p.lastModified || 0) > existing.lastActivity) {
          existing.lastActivity = p.lastModified || 0;
        }
        if (!existing.clientName && clientName) existing.clientName = clientName;
        if (!existing.clientEmail && clientEmail) existing.clientEmail = clientEmail;
        if (!existing.clientPhone && p.context?.clientPhone) existing.clientPhone = p.context?.clientPhone;
        if (!existing.clientLocation && p.context?.location) existing.clientLocation = p.context?.location;
        if (projectConfig) existing.configs.add(projectConfig);
        if (hasPendingInvoice) existing.hasPendingInvoices = true;
        if (isSiteActive) existing.hasActiveSite = true;
      } else {
        const configsSet = new Set<string>();
        if (projectConfig) configsSet.add(projectConfig);

        clientsMap.set(groupKey, {
          clientKey: groupKey,
          clientName: clientName || "Unknown Client",
          clientEmail: clientEmail || "",
          clientPhone: p.context?.clientPhone || "",
          clientLocation: p.context?.location || "",
          projects: [p],
          totalValue: projectValue,
          lastActivity: p.lastModified || now,
          configs: configsSet,
          hasPendingInvoices: hasPendingInvoice,
          hasActiveSite: isSiteActive,
        });
      }
    }

    const STATUS_TO_BUCKET: Record<string, 'pipeline' | 'active' | 'delivered' | 'lost'> = {
      lead: 'pipeline',
      draft: 'pipeline',
      proposal_sent: 'pipeline',
      negotiation: 'pipeline',
      won: 'active',
      execution: 'active',
      work_paused: 'active',
      completed: 'delivered',
      lost: 'lost',
      archived: 'lost',
    };

    const BUCKET_PRIORITY: Record<string, number> = {
      active: 4,
      pipeline: 3,
      delivered: 2,
      lost: 1,
    };

    const list: AggregatedClient[] = Array.from(clientsMap.values()).map(client => {
      let maxPriority = 0;
      let finalBucket: 'pipeline' | 'active' | 'delivered' | 'lost' = 'lost';
      let dummyCount = 0;

      for (const proj of client.projects) {
        if (isDummyProject(proj)) dummyCount++;
        const status = proj.context?.status || 'draft';
        const bucket = STATUS_TO_BUCKET[status] || 'pipeline';
        const priority = BUCKET_PRIORITY[bucket] || 0;
        if (priority > maxPriority) {
          maxPriority = priority;
          finalBucket = bucket;
        }
      }

      const daysIdle = Math.max(0, Math.floor((now - client.lastActivity) / ONE_DAY_MS));
      const isVip = client.totalValue >= 2500000; // >= ₹25L
      const isMultiProject = client.projects.length > 1;
      const isRecent = (now - client.lastActivity) <= ONE_WEEK_MS;
      const needsFollowup = (finalBucket === 'pipeline' || finalBucket === 'active') && daysIdle >= 14;
      const isDummy = dummyCount === client.projects.length;

      return {
        clientKey: client.clientKey,
        clientName: client.clientName,
        clientEmail: client.clientEmail,
        clientPhone: client.clientPhone,
        clientLocation: client.clientLocation,
        projects: client.projects,
        totalValue: client.totalValue,
        lastActivity: client.lastActivity,
        daysIdle,
        bucket: finalBucket,
        isVip,
        isMultiProject,
        hasActiveSite: client.hasActiveSite,
        hasPendingInvoices: client.hasPendingInvoices,
        isRecent,
        needsFollowup,
        isDummy,
        configs: Array.from(client.configs),
      };
    });

    return list;
  }, [projects]);

  /*
    The accounts the summary is allowed to speak for.

    It used to read from every account regardless of the Actual/Dummy switch,
    so the headline said "₹3,01,63,637 across 27 accounts" whichever of the
    three you picked — a portfolio figure with fourteen demo accounts folded
    into it, and a number that never moved when you asked it to.
  */
  const inScope = useMemo(() => aggregatedClients.filter(c => {
    if (selectedProjectKind === 'actual') return !c.isDummy;
    if (selectedProjectKind === 'dummy') return c.isDummy;
    return true;
  }), [aggregatedClients, selectedProjectKind]);

  // Compute summary stats
  /*
    Counted over what is on screen, not over everything.

    The bucket pills read 27 / 6 / 10 / 5 / 6 while the list below them showed
    thirteen accounts — they were still totalling the whole book after the
    directory had been scoped to real work. Only the Actual/Dummy split itself
    stays global, because that control exists to say how big each side is.
  */
  const stats = useMemo(() => {
    let total = inScope.length;
    const actualCount = aggregatedClients.filter(c => !c.isDummy).length;
    const dummyCount = aggregatedClients.length - actualCount;
    let pipeline = 0;
    let active = 0;
    let delivered = 0;
    let lost = 0;
    let openValue = 0;
    let multiProjectCount = 0;
    let vipCount = 0;
    let followupCount = 0;

    for (const c of inScope) {
      if (c.bucket === 'pipeline') {
        pipeline++;
        openValue += c.totalValue;
      } else if (c.bucket === 'active') {
        active++;
        openValue += c.totalValue;
      } else if (c.bucket === 'delivered') {
        delivered++;
      } else if (c.bucket === 'lost') {
        lost++;
      }

      if (c.isMultiProject) multiProjectCount++;
      if (c.isVip) vipCount++;
      if (c.needsFollowup) followupCount++;
    }

    return { 
      total, 
      /** Every account, whichever side of the split — what the toggle counts. */
      allCount: aggregatedClients.length,
      actualCount,
      dummyCount,
      pipeline, 
      active, 
      delivered, 
      lost, 
      openValue, 
      multiProjectCount,
      vipCount,
      followupCount
    };
  }, [aggregatedClients, inScope]);

  const getClientStageIndex = (client: AggregatedClient): number => {
    let maxStage = 1;
    for (const p of client.projects) {
      const s = p.context?.status || 'draft';
      if (s === 'completed') maxStage = Math.max(maxStage, 6);
      else if (s === 'execution' || s === 'work_paused') maxStage = Math.max(maxStage, 5);
      else if (s === 'won') maxStage = Math.max(maxStage, 4);
      else if (s === 'proposal_sent' || s === 'negotiation') maxStage = Math.max(maxStage, 3);
      else if (s === 'draft' && (p.context?.area || p.tiers?.length)) maxStage = Math.max(maxStage, 2);
      else maxStage = Math.max(maxStage, 1);
    }
    return maxStage;
  };

  /*
    What each account is actually waiting for.

    Every other screen in this app answers "what do I do next" — the Money
    panels, the Ops Matrix banner. A directory that only lists who exists
    makes the reader work that out twenty-seven times over.
  */
  const nextAction = (c: AggregatedClient): { label: string; tone: 'warn' | 'go' | 'plain' } => {
    if (c.hasPendingInvoices) return { label: 'Invoice out — chase the payment', tone: 'warn' };
    if (c.needsFollowup) return { label: `Quiet ${c.daysIdle} days — worth a call`, tone: 'warn' };
    if (c.bucket === 'active') return { label: 'On site — keep the updates going', tone: 'go' };
    if (c.bucket === 'pipeline') return { label: 'In the pipeline — move it along', tone: 'go' };
    if (c.bucket === 'delivered') return { label: 'Delivered — ask for the referral', tone: 'plain' };
    return { label: 'Dormant — reopen it or let it go', tone: 'plain' };
  };

  /*
    What the directory knows about itself.

    Every figure here comes from the aggregated accounts already on screen —
    nothing is fetched and nothing is estimated. The data-quality line exists
    because a shared inbox silently merged four different clients into one
    account, and there was no way to see that without opening the card.
  */
  const intel = useMemo(() => {
    const namesByEmail = new Map<string, Set<string>>();
    inScope.forEach(c => {
      const em = (c.clientEmail || '').toLowerCase().trim();
      if (!em) return;
      if (!namesByEmail.has(em)) namesByEmail.set(em, new Set());
      namesByEmail.get(em)!.add((c.clientName || '').trim());
    });
    const sharedEmails = [...namesByEmail.entries()].filter(([, names]) => names.size > 1);

    const noContact = inScope.filter(c => !c.clientEmail && !c.clientPhone);
    const unnamed = inScope.filter(c => !c.clientName || c.clientName === 'Unknown Client');

    const byValue = [...inScope].sort((a, b) => b.totalValue - a.totalValue);
    const book = byValue.reduce((sum, c) => sum + c.totalValue, 0);
    const topThree = byValue.slice(0, 3).reduce((sum, c) => sum + c.totalValue, 0);
    const dormantValue = inScope
      .filter(c => c.bucket === 'lost')
      .reduce((sum, c) => sum + c.totalValue, 0);

    /* Quiet for longest, with the biggest book, first. */
    const toCall = inScope
      .filter(c => c.needsFollowup)
      .sort((a, b) => (b.daysIdle * Math.max(b.totalValue, 1)) - (a.daysIdle * Math.max(a.totalValue, 1)))
      .slice(0, 3);

    const spread = LIFECYCLE_STAGES.map(st => ({
      ...st,
      n: inScope.filter(c => getClientStageIndex(c) === st.id).length,
    }));

    return {
      sharedEmails, noContact, unnamed,
      book,
      top: byValue[0] || null,
      topPct: book > 0 && byValue[0] ? Math.round((byValue[0].totalValue / book) * 100) : 0,
      topThree,
      topThreePct: book > 0 ? Math.round((topThree / book) * 100) : 0,
      dormantValue,
      dormantCount: inScope.filter(c => c.bucket === 'lost').length,
      toCall,
      toCallAll: inScope.filter(c => c.needsFollowup).length,
      spread,
      peakStage: Math.max(1, ...LIFECYCLE_STAGES.map(st => inScope.filter(c => getClientStageIndex(c) === st.id).length)),
    };
  }, [inScope]);

  // Determine stage progress for each client (1 to 6)
  const handleExportCSV = () => {
    if (aggregatedClients.length === 0) return;

    const headers = [
      "Client Name",
      "Email",
      "Phone",
      "Location",
      "Type",
      "Lifecycle Bucket",
      "Total Projects",
      "Project Names",
      "Configurations",
      "VIP Status",
      "Multi-Project",
      "Active Site",
      "Days Idle",
      "Last Activity",
      ...(!isDesigner ? ["Total Portfolio Value (INR)"] : [])
    ];

    const rows = aggregatedClients.map(c => [
      `"${c.clientName.replace(/"/g, '""')}"`,
      `"${c.clientEmail}"`,
      `"${c.clientPhone}"`,
      `"${c.clientLocation}"`,
      c.isDummy ? "Dummy / Sample" : "Actual",
      `"${c.bucket}"`,
      c.projects.length,
      `"${c.projects.map(p => p.context?.name || 'Untitled').join('; ')}"`,
      `"${c.configs.join('; ')}"`,
      c.isVip ? "Yes" : "No",
      c.isMultiProject ? "Yes" : "No",
      c.hasActiveSite ? "Yes" : "No",
      c.daysIdle,
      `"${new Date(c.lastActivity).toLocaleDateString()}"`,
      ...(!isDesigner ? [c.totalValue] : [])
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clients_directory_${orgData?.tenantId || 'studio'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Mount header vitals into the shell's PageTitleBlock!
  usePageHeader({
    vitals: [
      /* "Actual" is dropped: the toolbar toggle already states the split, and
         next to a scoped Accounts figure the two read as a contradiction. */
      { label: "Accounts", value: `${stats.total}` },
      { label: "Active sites", value: `${stats.active}` },
      { label: "Delivered", value: `${stats.delivered}` },
      { 
        label: !isDesigner ? "Active portfolio" : "Multi-project", 
        value: !isDesigner ? formatINR(stats.openValue) : `${stats.multiProjectCount} accounts`,
        tone: stats.openValue > 0 ? "good" : undefined 
      }
    ]
  }, [stats.total, stats.active, stats.delivered, stats.openValue, stats.multiProjectCount, isDesigner]);

  // Filter & Sort clients
  const filteredAndSortedClients = useMemo(() => {
    let result = aggregatedClients.filter(c => {
      // Actual vs Dummy filter
      if (selectedProjectKind === 'actual' && c.isDummy) return false;
      if (selectedProjectKind === 'dummy' && !c.isDummy) return false;

      // Bucket filter
      if (selectedBucket !== 'all' && c.bucket !== selectedBucket) return false;

      // Smart Tag filter
      if (selectedSmartTag === 'vip' && !c.isVip) return false;
      if (selectedSmartTag === 'multiproject' && !c.isMultiProject) return false;
      if (selectedSmartTag === 'execution' && !c.hasActiveSite) return false;
      if (selectedSmartTag === 'followup' && !c.needsFollowup) return false;
      if (selectedSmartTag === 'recent' && !c.isRecent) return false;
      if (selectedSmartTag === 'invoice_pending' && !c.hasPendingInvoices) return false;

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.clientName.toLowerCase().includes(q);
        const emailMatch = c.clientEmail.toLowerCase().includes(q);
        const phoneMatch = c.clientPhone.toLowerCase().includes(q);
        const locationMatch = c.clientLocation.toLowerCase().includes(q);
        const projectMatch = c.projects.some(p => (p.context?.name || '').toLowerCase().includes(q));
        const configMatch = c.configs.some(cfg => cfg.toLowerCase().includes(q));
        return nameMatch || emailMatch || phoneMatch || locationMatch || projectMatch || configMatch;
      }
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'value_desc') {
        return b.totalValue - a.totalValue;
      }
      if (sortBy === 'activity_desc') {
        return b.lastActivity - a.lastActivity;
      }
      if (sortBy === 'name_asc') {
        return a.clientName.localeCompare(b.clientName);
      }
      if (sortBy === 'projects_desc') {
        return b.projects.length - a.projects.length;
      }
      return 0;
    });

    return result;
  }, [aggregatedClients, selectedProjectKind, selectedBucket, selectedSmartTag, searchQuery, sortBy]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedClients);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedClients(next);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .filter(Boolean)
      .map(n => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C";
  };

  const openWhatsAppWithTemplate = (client: AggregatedClient, templateFn: (c: string, s: string, p: string) => string) => {
    if (!client.clientPhone) return;
    const cleaned = client.clientPhone.replace(/[^0-9]/g, '');
    const formattedPhone = cleaned.length === 10 ? `91${cleaned}` : cleaned;
    const studioName = orgData?.orgName || "our studio";
    const primaryProjName = client.projects[0]?.context?.name || "your interior project";
    const msg = encodeURIComponent(templateFn(client.clientName, studioName, primaryProjName));
    window.open(`https://wa.me/${formattedPhone}?text=${msg}`, '_blank', 'noopener,noreferrer');
    setActiveWhatsAppMenu(null);
  };

  return (
    /*
      The page sits on a tint so the white cards on it read as cards.

      Everything here used to be white on very-nearly-white, separated only by
      hairlines — which is why the screen looked flat however the colours were
      swapped. Depth now comes from the ground and a soft shadow; most of the
      borders are gone.
    */
    <div className="flex flex-col h-full bg-slate-100 text-slate-800">

      {/* The password is shown exactly once. It is never stored anywhere this
          app can read it back -- Firebase Auth holds only a hash -- so if it is
          lost the way forward is to reissue, not to look it up. */}
      <AnimatePresence>
        {issuedLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[200] bg-[#12182F]/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIssuedLogin(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    {issuedLogin.reissued ? "New password for" : "Portal login for"} {issuedLogin.clientName}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Send these to your client. They will be asked to choose their own password when they first sign in.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-500">Email</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5 break-all">{issuedLogin.email}</p>
                  </div>
                  <div className="px-3.5 py-2.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-500">Temporary password</p>
                    <p className="text-sm font-black text-slate-800 mt-0.5 tabular-nums select-all">{issuedLogin.tempPassword}</p>
                  </div>
                </div>

                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
                  This password is shown once and cannot be looked up later. Copy it now.
                </p>
              </div>

              <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIssuedLogin(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard?.writeText(
                        `Email: ${issuedLogin.email}
Temporary password: ${issuedLogin.tempPassword}`
                      );
                      setCopiedPassword(true);
                    } catch {
                      setCopiedPassword(false);
                    }
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#3D52A0] hover:bg-[#334486] transition"
                >
                  {copiedPassword ? "Copied" : "Copy both"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loginError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[210] bg-white border border-rose-200 text-rose-800 text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg"
            onClick={() => setLoginError(null)}
          >
            {loginError}
          </motion.div>
        )}
      </AnimatePresence>

      
      {/* ── What the directory knows about itself ──────────────────────
          Three figures, each a label, a number and one line. The stage
          chart is the widest because it is the only one that is a chart. */}
      <div className="px-4 lg:px-8 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">

          {/* Where the money actually sits */}
          <section className={`${CARD} xl:col-span-4`}>
            <h3 className={LABEL}>Under management</h3>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <CountUp value={Math.round(intel.book)} format={formatINR} className={FIGURE} />
              <span className="text-[11px] text-slate-500">across {inScope.length} {inScope.length === 1 ? 'account' : 'accounts'}</span>
            </div>

            {/* top three against the rest of the book */}
            <div className="h-2 rounded-full overflow-hidden mt-4 bg-slate-100">
              <div className="mny-bar h-full rounded-full bg-[#3D52A0]" style={{ width: `${intel.topThreePct}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">
              Top 3 hold <b className="text-slate-800 tabular-nums">{intel.topThreePct}%</b>
              {intel.top && <> · biggest is {intel.top.clientName} at {intel.topPct}%</>}
              {intel.dormantCount > 0 && (
                <> · <b className="text-amber-700 tabular-nums">{formatINR(intel.dormantValue)}</b> dormant</>
              )}
            </p>
          </section>

          {/* Who is worth a call */}
          <section className={`${CARD} xl:col-span-3`} style={{ animationDelay: '40ms' }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className={LABEL}>Who to call next</h3>
              {intel.toCallAll > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSmartTag(selectedSmartTag === 'followup' ? 'all' : 'followup')}
                  className="text-[11px] font-semibold text-[#3D52A0] hover:text-[#334486] transition-colors"
                >
                  {selectedSmartTag === 'followup' ? 'Show all' : `See all ${intel.toCallAll}`}
                </button>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <CountUp value={intel.toCallAll} className={`${FIGURE} ${intel.toCallAll > 0 ? '' : '!text-slate-400'}`} />
              <span className="text-[11px] text-slate-500">
                {intel.toCallAll === 1 ? 'account has gone quiet' : 'accounts have gone quiet'}
              </span>
            </div>
            {intel.toCall.length === 0 ? (
              <p className="flex items-start gap-2 text-[11px] text-slate-500 mt-4 leading-snug">
                <StateDot tone="good" className="mt-1" />
                Every live account has been touched inside a fortnight
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {intel.toCall.map((c) => (
                  <li key={c.clientKey}>
                    <button
                      type="button"
                      onClick={() => setDossierClient(c)}
                      className="w-full text-left flex items-center gap-2 rounded-lg px-2 -mx-2 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-800 truncate flex-1 min-w-0">{c.clientName}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{c.daysIdle}d quiet</span>
                      {!isDesigner && <span className="text-[11px] font-bold text-slate-700 tabular-nums shrink-0">{formatINR(c.totalValue)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Where the book is stuck: the busiest stage carries the brand, the rest stay grey */}
          <section className={`${CARD} md:col-span-2 xl:col-span-5`} style={{ animationDelay: '80ms' }}>
            <h3 className={LABEL}>Where the book sits</h3>
            {(() => {
              const busiest = intel.spread.reduce((a, b) => (b.n > a.n ? b : a), intel.spread[0]);
              return (
                <>
                  <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                    <CountUp value={busiest.n} className={FIGURE} />
                    <span className="text-[11px] text-slate-500">sitting at {busiest.label}</span>
                  </div>
                  <div className="flex items-end gap-1 sm:gap-2 mt-4 h-12 border-b border-slate-200">
                    {intel.spread.map(st => (
                      <div key={st.id} className="flex-1 min-w-0 flex flex-col justify-end h-full" title={`${st.n} in ${st.label}`}>
                        <div
                          className={`w-full rounded-t ${st.n === 0 ? 'bg-slate-100' : st.id === busiest.id ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}
                          style={{ height: `${st.n === 0 ? 2 : Math.max(4, Math.round((st.n / intel.peakStage) * 48))}px` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-1 sm:gap-2 mt-2">
                    {intel.spread.map(st => (
                      <span key={st.id} className="flex-1 min-w-0 text-center">
                        <span className={`block text-xs font-bold tabular-nums ${st.id === busiest.id ? 'text-[#3D52A0]' : st.n === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{st.n}</span>
                        <span className="block text-[10px] text-slate-500 truncate">{st.label}</span>
                      </span>
                    ))}
                  </div>
                </>
              );
            })()}
          </section>
        </div>

        {/* ── what is wrong with the directory itself ─────────────────── */}
        {(intel.sharedEmails.length > 0 || intel.noContact.length > 0 || intel.unnamed.length > 0) && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className={`flex items-center gap-2 ${LABEL}`}>
              <StateDot tone="warn" /> Worth a look
            </span>
            {intel.sharedEmails.map(([email, names]) => (
              <span key={email} className="text-xs text-slate-500">
                <b className="text-slate-800 tabular-nums">{names.size}</b> accounts share <b className="text-slate-800">{email}</b>
                {' '}({[...names].filter(Boolean).join(', ')})
              </span>
            ))}
            {intel.noContact.length > 0 && (
              <span className="text-xs text-slate-500"><b className="text-slate-800 tabular-nums">{intel.noContact.length}</b> with no email or phone</span>
            )}
            {intel.unnamed.length > 0 && (
              <span className="text-xs text-slate-500"><b className="text-slate-800 tabular-nums">{intel.unnamed.length}</b> unnamed</span>
            )}
          </div>
        )}
      </div>

      {/* 1. Search, the Actual / Dummy split, sort, view and the two actions */}
      <div className="px-4 lg:px-8 pt-4 pb-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative grow basis-64 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
              <input
                type="text"
                aria-label="Search clients"
                placeholder="Search clients, places or projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${INPUT} pl-9 pr-8 placeholder:text-slate-400`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Segmented<ProjectKindFilter>
              label="Actual or dummy projects"
              value={selectedProjectKind}
              onChange={setSelectedProjectKind}
              options={[
                { id: 'all', label: 'All', count: stats.allCount },
                { id: 'actual', label: 'Actual', count: stats.actualCount },
                { id: 'dummy', label: 'Dummy', count: stats.dummyCount },
              ]}
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort accounts"
              title="Sort accounts"
              className={`${INPUT} !w-auto font-semibold text-slate-700 cursor-pointer`}
            >
              <option value="activity_desc">Recent activity</option>
              {!isDesigner && <option value="value_desc">Portfolio value</option>}
              <option value="projects_desc">Project count</option>
              <option value="name_asc">Name, A to Z</option>
            </select>

            <Segmented<'grid' | 'table'>
              label="View"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { id: 'grid', label: <span title="Accounts with their next move" className="flex"><LayoutGrid className="w-4 h-4" aria-label="Accounts view" /></span> },
                { id: 'table', label: <span title="Plain table" className="flex"><List className="w-4 h-4" aria-label="Table view" /></span> },
              ]}
            />

            <div className="flex items-center gap-2 ml-auto">
              <Button icon={Download} onClick={handleExportCSV} title="Export the client list as a CSV file">Export CSV</Button>
              <Button variant="primary" icon={Plus} onClick={onCreateNew}>New project</Button>
            </div>
          </div>

          {/* Row 2: where each account is in its life, and the occasional refinements */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">

            <div className="flex flex-wrap gap-2 items-center">
              {(['all', 'active', 'pipeline', 'delivered', 'lost'] as BucketType[]).map((bucket) => {
                const isSelected = selectedBucket === bucket;
                const count = bucket === 'all'
                  ? stats.total
                  : bucket === 'active'
                  ? stats.active
                  : bucket === 'pipeline'
                  ? stats.pipeline
                  : bucket === 'delivered'
                  ? stats.delivered
                  : stats.lost;

                return (
                  <button
                    key={bucket}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedBucket(bucket)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? "bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/20"
                        : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span>{BUCKET_CONFIG[bucket].label}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${isSelected ? "text-[#3D52A0]" : "text-slate-400"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/*
              One button instead of six chips.

              Search and the five buckets are how you move around, so they stay
              on show. These six are refinements you reach for occasionally,
              and laid out flat they made the toolbar the busiest thing on the
              page. The button carries a dot when one is on, so nothing hides.
            */}
            <div className="relative shrink-0">
              <button
                type="button"
                ref={filtersBtnRef}
                onClick={() => {
                  /*
                    Measured, not guessed.

                    The bucket row wraps, so this button sits on the left at
                    narrow widths and on the right at wide ones. A fixed
                    `right-0` hung the menu off the left edge at 800px; `left-0`
                    hung it off the right edge at 1280. Clamping to the
                    viewport is the only anchor that holds at both.
                  */
                  const r = filtersBtnRef.current?.getBoundingClientRect();
                  if (r) {
                    const W = 240;
                    setFiltersAt({
                      top: r.bottom + 8,
                      left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
                    });
                  }
                  setFiltersOpen(o => !o);
                }}
                aria-expanded={filtersOpen}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border cursor-pointer ${
                  selectedSmartTag !== 'all'
                    ? 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                Filters
                {selectedSmartTag !== 'all' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3D52A0]" />
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {filtersOpen && filtersAt && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      style={{ position: 'fixed', top: filtersAt.top, left: filtersAt.left, width: 240, zIndex: 50 }}
                      className="bg-white rounded-xl border border-slate-200 cd-pop p-2"
                    >
                      {[
                        { id: 'all', label: 'All accounts' },
                        { id: 'vip', label: 'High value, over ₹25L' },
                        { id: 'followup', label: `Touchpoint due (${stats.followupCount})` },
                        { id: 'multiproject', label: 'More than one project' },
                        { id: 'execution', label: 'Active site' },
                        { id: 'invoice_pending', label: 'Invoiced' },
                      ].map((chip) => {
                        const isSelected = selectedSmartTag === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => { setSelectedSmartTag(chip.id as SmartFilterTag); setFiltersOpen(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                              isSelected ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {chip.label}
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN DIRECTORY ROSTER */}
      <div className="px-4 lg:px-8 pb-16 flex-1">
        {filteredAndSortedClients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl mx-auto my-8 hud-panel-in">
            {(searchQuery || selectedBucket !== 'all' || selectedSmartTag !== 'all' || selectedProjectKind !== 'all') ? (
              <EmptyState
                icon={Users}
                title="No accounts match"
                text="Clear the search and filters to see every client again"
                action={
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedBucket('all');
                      setSelectedSmartTag('all');
                      setSelectedProjectKind('all');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No clients yet"
                text="A client appears here as soon as their first project is created"
                action={<Button variant="primary" icon={Plus} onClick={onCreateNew}>New project</Button>}
              />
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /*
            One table, not twenty-seven cards.

            A three-column grid of cards showed six accounts on a screen and
            made every one of them look equally important. The Drawing Tracker
            already proved the shape that works here: a named column header, a
            dense row per record, the detail opening in place.
          */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            <div className={`hidden lg:grid ${ROW_GRID} gap-x-4 px-6 py-3 bg-slate-50 border-b border-slate-200`}>
              {['Account', 'Stage', 'Status', 'Next move', !isDesigner ? 'Portfolio' : 'Projects', ''].map((h, i) => (
                <span key={i} className={`${LABEL} ${i === 4 ? 'text-right' : ''}`}>{h}</span>
              ))}
            </div>

            <div className="divide-y divide-slate-100">
                {filteredAndSortedClients.map((client, index) => {
                  const clientKey = client.clientKey;
                  const isExpanded = expandedClients.has(clientKey);
                  const bConfig = BUCKET_CONFIG[client.bucket];
                  const notesCount = (clientNotes[clientKey] || []).length;
                  const stageIndex = getClientStageIndex(client);
                  const act = nextAction(client);

                  return (
                    <div
                      key={clientKey}
                      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                      className={`group relative hud-row-in transition-colors ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className={`grid grid-cols-[1fr_auto] ${ROW_GRID} items-center gap-x-4 gap-y-2 px-4 lg:px-6 py-3`}>

                        {/* who */}
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(clientKey, e)}
                          className="min-w-0 text-left flex items-center gap-3 cursor-pointer"
                        >
                          <span className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 bg-[#3D52A0]/10 text-[#3D52A0]">
                            {getInitials(client.clientName)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-sm text-slate-800 truncate">{client.clientName}</span>
                              {client.isVip && <span title="High value, over ₹25L" className="flex shrink-0"><Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /></span>}
                              {client.isDummy && <Chip tone="warn" className="shrink-0">Dummy</Chip>}
                            </span>
                            <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                              {[client.clientLocation, client.configs.join(', '), client.clientEmail || client.clientPhone].filter(Boolean).join(' · ') || 'No contact'}
                            </span>
                          </span>
                        </button>

                        {/* how far along */}
                        <div className="hidden lg:block min-w-0">
                          <div className="flex items-center gap-1">
                            {LIFECYCLE_STAGES.map(stg => (
                              <span
                                key={stg.id}
                                title={`Stage ${stg.id}: ${stg.label}`}
                                className={`flex-1 h-1.5 rounded-full ${
                                  stg.id === stageIndex ? 'bg-[#3D52A0]' : stg.id < stageIndex ? 'bg-[#3D52A0]/30' : 'bg-slate-100'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="block text-[11px] text-slate-500 mt-1.5 truncate tabular-nums">
                            {LIFECYCLE_STAGES[stageIndex - 1]?.label} · {stageIndex} of 6
                          </span>
                        </div>

                        {/* what state */}
                        <div className="hidden lg:flex flex-col items-start gap-1 min-w-0">
                          <Chip tone={bConfig.tone}>{bConfig.label}</Chip>
                          <span className="text-[11px] text-slate-500 truncate">{timeAgo(client.lastActivity)}</span>
                        </div>

                        {/* what to do about it */}
                        <p className={`hidden lg:flex items-start gap-2 text-xs leading-snug ${
                          act.tone === 'plain' ? 'text-slate-500' : 'text-slate-700 font-semibold'
                        }`}>
                          {act.tone === 'warn' && <StateDot tone="warn" className="mt-1" />}
                          {act.label}
                        </p>

                        {/* how much */}
                        <div className="hidden lg:block text-right">
                          <span className="block text-sm font-black text-slate-800 tabular-nums leading-none">
                            {!isDesigner ? formatINR(client.totalValue) : `${client.projects.length}`}
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-1">
                            {!isDesigner
                              ? `${client.projects.length} ${client.projects.length === 1 ? 'project' : 'projects'}`
                              : client.projects.length === 1 ? 'project' : 'projects'}
                            {notesCount > 0 && ` · ${notesCount} note${notesCount > 1 ? 's' : ''}`}
                          </span>
                        </div>

                        {/* what you can do */}
                        <div className="flex items-center justify-end gap-1 shrink-0">
                          {client.projects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleIssueClientLogin(client.projects[0], client.clientName, false, e)}
                              disabled={issuingLoginFor === client.projects[0].id}
                              title="Create or reset this client's portal login"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {client.projects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleCopyPortalUrl(client.projects[0].id, e)}
                              title="Copy client portal link"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer"
                            >
                              {copiedId === 'portal-' + client.projects[0].id ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                                : copiedId === 'noportal-' + client.projects[0].id ? <X className="w-3.5 h-3.5 text-amber-600" />
                                : <Globe className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {client.clientPhone && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveWhatsAppMenu(activeWhatsAppMenu === clientKey ? null : clientKey)}
                                title="WhatsApp quick scripts"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <AnimatePresence>
                                {activeWhatsAppMenu === clientKey && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setActiveWhatsAppMenu(null)} />
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                      className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl cd-pop p-2 z-50 text-left"
                                    >
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 border-b border-slate-100">Send WhatsApp message</p>
                                      <div className="space-y-1 mt-1">
                                        {WHATSAPP_TEMPLATES.map(tmpl => (
                                          <button
                                            key={tmpl.id}
                                            onClick={() => openWhatsAppWithTemplate(client, tmpl.template)}
                                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors flex items-center justify-between group/w cursor-pointer"
                                          >
                                            <span>{tmpl.title}</span>
                                            <Send className="w-3 h-3 text-slate-500 group-hover/w:text-emerald-600 transition-colors" />
                                          </button>
                                        ))}
                                      </div>
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setDossierClient(client)}
                            title="Open dossier and studio notes"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(clientKey, e)}
                            aria-expanded={isExpanded}
                            title={isExpanded ? 'Hide projects' : 'Show projects'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* everything the row could not hold, on small screens */}
                      <div className="lg:hidden px-4 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Chip tone={bConfig.tone}>{bConfig.label}</Chip>
                        {!isDesigner && <span className="text-xs font-black text-slate-800 tabular-nums">{formatINR(client.totalValue)}</span>}
                        <span className={`flex items-center gap-2 text-[11px] ${act.tone === 'plain' ? 'text-slate-500' : 'text-slate-700 font-semibold'}`}>
                          {act.tone === 'warn' && <StateDot tone="warn" />}
                          {act.label}
                        </span>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 lg:px-6 lg:pl-[72px] pb-4 space-y-2">
                              {client.projects.map(proj => {
                                const pVal = getSingleProjectValue(proj);
                                const pStatus = proj.context?.status || 'draft';
                                const pConfig = PROJECT_STATUS_CONFIG[pStatus] || { label: pStatus, tone: 'slate' as Tone };
                                return (
                                  <button
                                    key={proj.id}
                                    type="button"
                                    onClick={() => onOpenProject(proj)}
                                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded-xl hover:border-[#3D52A0]/20 cursor-pointer transition-colors flex items-center justify-between gap-2 group/item"
                                  >
                                    <span className="min-w-0 flex-1 flex items-center gap-2">
                                      <span className="font-bold text-xs text-slate-800 group-hover/item:text-[#3D52A0] truncate transition-colors">
                                        {proj.context?.name || 'Untitled project'}
                                      </span>
                                      <Chip tone={pConfig.tone} className="shrink-0">{pConfig.label}</Chip>
                                      {proj.context?.config && <span className="text-[10px] text-slate-500 shrink-0">{proj.context.config}</span>}
                                    </span>
                                    <span className="tabular-nums text-xs font-bold text-slate-700 shrink-0">{formatINR(pVal)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          /* The plain table: every account on one line, nothing opening in place. */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hud-panel-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className={`bg-slate-50 border-b border-slate-200 ${LABEL}`}>
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Projects</th>
                    {!isDesigner && <th className="px-4 py-3 text-right">Portfolio</th>}
                    <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredAndSortedClients.map((client) => {
                    const bConfig = BUCKET_CONFIG[client.bucket];
                    const stageIndex = getClientStageIndex(client);
                    return (
                      <tr key={client.clientKey} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(client.clientName)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{client.clientName}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{client.clientEmail || client.clientPhone || 'No contact'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Chip tone={client.isDummy ? 'warn' : 'slate'}>{client.isDummy ? 'Dummy' : 'Actual'}</Chip>
                        </td>
                        <td className="px-4 py-3.5">
                          <Chip tone={bConfig.tone}>{bConfig.label}</Chip>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">{client.clientLocation || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-700">{LIFECYCLE_STAGES[stageIndex - 1]?.label || 'Consult'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">{client.projects.length}</td>
                        {!isDesigner && (
                          <td className="px-4 py-3.5 text-right tabular-nums text-sm font-black text-slate-800">
                            {formatINR(client.totalValue)}
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {client.projects[0] && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyPortalUrl(client.projects[0].id, e)}
                                  title="Copy client portal link"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 transition-colors cursor-pointer"
                                >
                                  {copiedId === "portal-" + client.projects[0].id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Globe className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <Button size="sm" onClick={() => onOpenProject(client.projects[0])}>Open</Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. CLIENT DOSSIER & NOTES SLIDE-OVER DRAWER */}
      <AnimatePresence>
        {dossierClient && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDossierClient(null)}
              className="absolute inset-0 bg-[#12182F]/30 backdrop-blur-2xs"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col justify-between border-l border-slate-200"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#3D52A0]/10 text-[#3D52A0] border border-[#3D52A0]/20 flex items-center justify-center font-bold text-sm">
                    {getInitials(dossierClient.clientName)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{dossierClient.clientName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dossierClient.clientLocation || "No location specified"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDossierClient(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                {/* Vitals Summary */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Total portfolio</span>
                    <span className="text-sm font-bold text-slate-800 tabular-nums mt-0.5 block">
                      {formatINR(dossierClient.totalValue)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Projects</span>
                    <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                      {dossierClient.projects.length} project{dossierClient.projects.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Contact Records */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 block uppercase tracking-wider">Contact</span>
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2.5 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                      <span className="font-medium text-slate-800 select-all">{dossierClient.clientEmail || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                      <span className="font-medium text-slate-800 select-all">{dossierClient.clientPhone || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Studio Internal Notes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Studio notes</span>
                    <span className="text-[10px] text-slate-500">
                      {(clientNotes[dossierClient.clientKey] || []).length} recorded
                    </span>
                  </div>

                  {/* Add Note Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a note only the studio sees"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNote(dossierClient.clientKey);
                      }}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-[#3D52A0]"
                    />
                    <button
                      onClick={() => handleAddNote(dossierClient.clientKey)}
                      disabled={!newNoteText.trim()}
                      className="px-3.5 py-2 bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>

                  {/* Notes Feed */}
                  <div className="space-y-2 pt-1 max-h-56 overflow-y-auto">
                    {(clientNotes[dossierClient.clientKey] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 py-2 text-center">No notes for this client yet</p>
                    ) : (
                      (clientNotes[dossierClient.clientKey] || []).map((note) => (
                        <div key={note.id} className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex items-start justify-between gap-2 text-xs">
                          <div>
                            <p className="text-slate-800 leading-relaxed">{note.text}</p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              By <span className="font-medium text-slate-500">{note.author}</span> • {timeAgo(note.createdAt)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(dossierClient.clientKey, note.id)}
                            className="text-slate-400 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                            title="Delete note"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  Last active {timeAgo(dossierClient.lastActivity)}
                </span>
                <div className="flex items-center gap-2">
                  {dossierClient.projects[0] && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPortalUrl(dossierClient.projects[0].id, e, false)}
                        className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copy active portal link"
                      >
                        {copiedId === "portal-" + dossierClient.projects[0].id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3.5 h-3.5 text-[#3D52A0]" />
                            <span>Copy link</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          /* Replaces the link the client already has, so it takes a
                             second click, as Renew does on Project Home. */
                          const id = dossierClient.projects[0].id;
                          if (confirmReissueFor !== id) { e.stopPropagation(); setConfirmReissueFor(id); return; }
                          setConfirmReissueFor(null);
                          handleCopyPortalUrl(id, e, true);
                        }}
                        className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Replace the client's link with a new one. Send them the new link: the old one no longer shows your studio on the sign-in page."
                      >
                        {confirmReissueFor === dossierClient.projects[0].id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-[#3D52A0]" />
                            <span>Confirm reissue</span>
                          </>
                        ) : copiedId === "newportal-" + dossierClient.projects[0].id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>New link copied</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-[#3D52A0]" />
                            <span>Reissue link</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {dossierClient.projects[0] && (
                    <button
                      onClick={() => {
                        onOpenProject(dossierClient.projects[0]);
                        setDossierClient(null);
                      }}
                      className="btn-primary px-4 py-2 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Open project</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
