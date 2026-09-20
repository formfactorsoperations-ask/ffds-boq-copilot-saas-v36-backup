import React, { useState, useMemo, useRef } from "react";
import { FullProjectData } from "../types";
import { formatINR, timeAgo } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "../contexts/OrgContext";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { db } from "../services/dbService";
import { issuePortalAccess, PortalAccess } from "../services/portalAccessService";
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
  ArrowUpDown, 
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
  Pin,
  Sparkles,
  Check,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

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

const BUCKET_CONFIG: Record<
  BucketType,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  all: {
    label: "All Accounts",
    color: "text-[#3A416B]",
    bg: "bg-[#F6F7FB]",
    border: "border-[#E2E5F0]",
    dot: "bg-[#8E96B8]"
  },
  active: {
    label: "Active Site",
    color: "text-[#12182F]",
    bg: "bg-[#EDE8F5]/80",
    border: "border-[#ADBBDA]",
    dot: "bg-[#3D52A0]"
  },
  pipeline: {
    label: "In Pipeline",
    color: "text-amber-900",
    bg: "bg-amber-50/80",
    border: "border-amber-200",
    dot: "bg-amber-500"
  },
  delivered: {
    label: "Delivered",
    color: "text-emerald-900",
    bg: "bg-emerald-50/80",
    border: "border-emerald-200",
    dot: "bg-emerald-600"
  },
  lost: {
    label: "Dormant",
    color: "text-[#5A628A]",
    bg: "bg-[#F6F7FB]",
    border: "border-[#E2E5F0]",
    dot: "bg-[#8E96B8]"
  }
};

/** The bucket colour as a value, for the rail down the edge of each card. */
const RAIL: Record<BucketType, string> = {
  all: '#ADBBDA',
  pipeline: '#7091E6',
  active: '#3D52A0',
  delivered: '#2F9E6E',
  lost: '#ADBBDA',
};

const PROJECT_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  lead: { label: "Discovery", color: "text-[#3A416B]", bg: "bg-[#EDEFF7]", border: "border-[#E2E5F0]" },
  draft: { label: "Drafting", color: "text-[#3A416B]", bg: "bg-[#EDEFF7]", border: "border-[#E2E5F0]" },
  proposal_sent: { label: "Proposal", color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  negotiation: { label: "Negotiation", color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  won: { label: "Contracted", color: "text-[#12182F]", bg: "bg-[#EDE8F5]", border: "border-[#ADBBDA]" },
  execution: { label: "On Site", color: "text-[#12182F]", bg: "bg-[#EDE8F5]", border: "border-[#ADBBDA]" },
  work_paused: { label: "Paused", color: "text-rose-800", bg: "bg-rose-50", border: "border-rose-200" },
  completed: { label: "Handed Over", color: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-200" },
  lost: { label: "Lost", color: "text-[#5A628A]", bg: "bg-[#EDEFF7]", border: "border-[#E2E5F0]" },
  archived: { label: "Archived", color: "text-[#8E96B8]", bg: "bg-[#F6F7FB]", border: "border-[#E2E5F0]" },
};

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

    const existing = (project.context as any)?.portalAccess as
      | { token: string; expiresAt?: string }
      | undefined;
    const live =
      !forceNew &&
      existing?.token &&
      (!existing.expiresAt || new Date(existing.expiresAt).getTime() > Date.now());

    let token = existing?.token;
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

    const origin = typeof window !== "undefined" ? window.location.origin : "";
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

  // Helper to determine if a project is dummy/sample
  const isDummyProject = (p: FullProjectData) => {
    // 1. Check explicit isDummy boolean property if set
    if (typeof p.context?.isDummy === 'boolean') {
      return p.context.isDummy;
    }
    // 2. Check explicit projectCategory if set
    if (p.context?.projectCategory === 'dummy') return true;
    if (p.context?.projectCategory === 'actual') return false;

    // 3. Fallback to heuristic string pattern matching
    const name = (p.context?.name || '').toLowerCase();
    const client = (p.context?.clientName || '').toLowerCase();
    const email = (p.context?.clientEmail || '').toLowerCase();
    return name.includes('sample') || name.includes('demo') || name.includes('test') || name.includes('template') ||
           client.includes('sample') || client.includes('demo') || client.includes('test') || client.includes('abc') || client.includes('dummy') ||
           email.includes('example.com') || email.includes('test.com') || p.id?.startsWith('sample-') || p.id?.startsWith('demo-');
  };

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
      { label: "Active & Sites", value: `${stats.active}` },
      { label: "Delivered", value: `${stats.delivered}` },
      { 
        label: !isDesigner ? "Active Portfolio" : "Multi-Project", 
        value: !isDesigner ? formatINR(stats.openValue) : `${stats.multiProjectCount} Accounts`,
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
    <div className="flex flex-col h-full bg-[#F1F3F9] text-[#12182F]">

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
              className="bg-white rounded-3xl border border-[#E2E5F0] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <h4 className="font-extrabold text-[#12182F] text-[15px]">
                    {issuedLogin.reissued ? "New password for" : "Portal login for"} {issuedLogin.clientName}
                  </h4>
                  <p className="text-[13px] text-[#5A628A] font-medium mt-1 leading-relaxed">
                    Send these to your client. They will be asked to choose their own password when they first sign in.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#E2E5F0] divide-y divide-[#EDEFF7] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-[#F6F7FB]">
                    <p className="text-[10px] uppercase font-black tracking-wider text-[#8E96B8]">Email</p>
                    <p className="text-[13px] font-bold text-[#252C4E] mt-0.5 break-all">{issuedLogin.email}</p>
                  </div>
                  <div className="px-3.5 py-2.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-[#8E96B8]">Temporary password</p>
                    <p className="text-[15px] font-black text-[#12182F] mt-0.5 tabular-nums select-all">{issuedLogin.tempPassword}</p>
                  </div>
                </div>

                <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
                  This password is shown once and cannot be looked up later. Copy it now.
                </p>
              </div>

              <div className="bg-[#F6F7FB] px-5 py-3.5 border-t border-[#E2E5F0] flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIssuedLogin(null)}
                  className="px-4 py-2 bg-white hover:bg-[#EDEFF7] border border-[#E2E5F0] rounded-xl text-xs font-bold text-[#3A416B] transition"
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
                  className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-[#3D52A0] hover:bg-[#334486] transition"
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

      
      {/* ── What the directory knows about itself ────────────────────── */}
      <div className="px-4 lg:px-8 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Where the money actually sits */}
          <div className="relative bg-white rounded-3xl cd-panel p-5 overflow-hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5A628A]">Under management</h3>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <span className="text-[26px] leading-none font-bold text-[#12182F] tabular-nums">{formatINR(intel.book)}</span>
              <span className="text-[11px] text-[#8E96B8]">across {inScope.length} {inScope.length === 1 ? 'account' : 'accounts'}</span>
            </div>

            {/* top three against the rest of the book */}
            <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-[#EDEFF7]">
              <div className="mny-bar" style={{ width: `${intel.topThreePct}%`, background: 'linear-gradient(90deg,#7091E6,#3D52A0)' }} />
              <div className="mny-bar flex-1" style={{ background: '#E2E5F0', animationDelay: '.1s' }} />
            </div>
            <p className="text-[11px] text-[#8E96B8] mt-2 leading-snug">
              Top 3 hold <b className="text-[#12182F] tabular-nums">{intel.topThreePct}%</b>
              {intel.top && <> · biggest is {intel.top.clientName} at {intel.topPct}%</>}
              {intel.dormantCount > 0 && (
                <> · <b className="text-amber-700 tabular-nums">{formatINR(intel.dormantValue)}</b> dormant</>
              )}
            </p>
          </div>

          {/* Who is worth a call */}
          <div className="relative bg-white rounded-3xl cd-panel p-5 overflow-hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5A628A] flex items-center justify-between gap-2">
              <span>Who to call next</span>
              {intel.toCallAll > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSmartTag(selectedSmartTag === 'followup' ? 'all' : 'followup')}
                  className="text-[10px] font-semibold normal-case tracking-normal text-[#ADBBDA] hover:text-[#3D52A0] transition-colors"
                >
                  {intel.toCallAll} due &rsaquo;
                </button>
              )}
            </h3>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <span className={`text-[26px] leading-none font-bold tabular-nums ${stats.followupCount > 0 ? 'text-[#12182F]' : 'text-[#8E96B8]'}`}>
                {intel.toCallAll}
              </span>
              <span className="text-[11px] text-[#8E96B8]">
                {intel.toCallAll === 1 ? 'account has gone quiet' : 'accounts have gone quiet'}
              </span>
            </div>
            {intel.toCall.length === 0 ? (
              <p className="text-[11px] text-[#8E96B8] mt-3 leading-snug">Every live account has been touched inside a fortnight.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {intel.toCall.map((c, i) => (
                  <li key={c.clientKey}>
                    <button
                      type="button"
                      onClick={() => setDossierClient(c)}
                      className="w-full text-left flex items-center gap-2 rounded-lg px-1.5 -mx-1.5 py-1 hover:bg-[#F6F7FB] transition-colors"
                    >
                      <span className="text-[10px] font-black text-[#ADBBDA] tabular-nums w-3 shrink-0">{i + 1}</span>
                      <span className="text-[12px] font-bold text-[#12182F] truncate flex-1 min-w-0">{c.clientName}</span>
                      <span className="text-[10px] text-[#8E96B8] tabular-nums shrink-0">{c.daysIdle}d quiet</span>
                      <span className="text-[11px] font-bold text-[#3A416B] tabular-nums shrink-0">{formatINR(c.totalValue)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Where the book is stuck */}
          <div className="relative bg-white rounded-3xl cd-panel p-5 overflow-hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5A628A]">Where the book sits</h3>
            {(() => {
              const busiest = intel.spread.reduce((a, b) => (b.n > a.n ? b : a), intel.spread[0]);
              return (
                <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                  <span className="text-[26px] leading-none font-bold text-[#12182F] tabular-nums">{busiest.n}</span>
                  <span className="text-[11px] text-[#8E96B8]">sitting at {busiest.label}</span>
                </div>
              );
            })()}
            <div className="flex items-end gap-1.5 mt-4" style={{ height: '38px' }}>
              {intel.spread.map(st => (
                <div key={st.id} className="flex-1 min-w-0 flex flex-col justify-end h-full" title={`${st.n} in ${st.label}`}>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${st.n === 0 ? 2 : Math.max(4, (st.n / intel.peakStage) * 34)}px`,
                      background: st.n === 0 ? '#EDEFF7' : '#3D52A0',
                      opacity: st.n === 0 ? 1 : 0.35 + 0.65 * (st.n / intel.peakStage),
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-1.5 mt-1.5">
              {intel.spread.map(st => (
                <span key={st.id} className="flex-1 min-w-0 text-center">
                  <span className="block text-[9px] text-[#8E96B8] truncate">{st.label}</span>
                  <span className="block text-[10px] font-bold text-[#3A416B] tabular-nums">{st.n}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── what is wrong with the directory itself ─────────────────── */}
        {(intel.sharedEmails.length > 0 || intel.noContact.length > 0 || intel.unnamed.length > 0) && (
          <div className="mt-3 rounded-2xl border border-[#E2E5F0] bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5" /> Worth a look
            </span>
            {intel.sharedEmails.map(([email, names]) => (
              <span key={email} className="text-[11px] text-amber-900">
                <b className="tabular-nums">{names.size}</b> accounts share <b>{email}</b>
                <span className="text-amber-700"> ({[...names].filter(Boolean).join(', ')})</span>
              </span>
            ))}
            {intel.noContact.length > 0 && (
              <span className="text-[11px] text-amber-900"><b className="tabular-nums">{intel.noContact.length}</b> with no email or phone</span>
            )}
            {intel.unnamed.length > 0 && (
              <span className="text-[11px] text-amber-900"><b className="tabular-nums">{intel.unnamed.length}</b> unnamed</span>
            )}
          </div>
        )}
      </div>

      {/* 1. FILTER & SEARCH TOOLBAR (Sky Blue Theme + Actual/Dummy Filter) */}
      <div className="px-4 lg:px-8 pt-2 pb-4">
        <div className="bg-white p-4 rounded-3xl cd-panel flex flex-col gap-3">
          
          {/* Row 1: Search + Actual/Dummy Switcher + Sort + View Mode */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E96B8]">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by client name, email, phone, city, or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9.5 pr-8 py-2 bg-[#F6F7FB]/60 border border-[#E2E5F0]/80 rounded-xl text-xs font-medium text-[#12182F] outline-none focus:bg-white focus:border-[#3D52A0] focus:ring-1 focus:ring-[#E2E5F0] transition-all placeholder:text-[#8E96B8]"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E96B8] hover:text-[#5A628A] p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Actual vs Dummy Filter Pill */}
            <div className="flex items-center bg-[#EDEFF7]/90 p-0.5 rounded-xl border border-[#E2E5F0]/70 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProjectKind('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedProjectKind === 'all'
                    ? 'bg-[#3D52A0] text-white shadow-2xs font-semibold'
                    : 'text-[#5A628A] hover:text-[#12182F]'
                }`}
              >
                All ({stats.allCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedProjectKind('actual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedProjectKind === 'actual'
                    ? 'bg-[#3D52A0] text-white shadow-2xs font-semibold'
                    : 'text-[#5A628A] hover:text-[#12182F]'
                }`}
              >
                <Pin className="w-3 h-3 text-[#ADBBDA]" />
                <span>Actual ({stats.actualCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedProjectKind('dummy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedProjectKind === 'dummy'
                    ? 'bg-[#3D52A0] text-white shadow-2xs font-semibold'
                    : 'text-[#5A628A] hover:text-[#12182F]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Dummy ({stats.dummyCount})</span>
              </button>
            </div>

            {/* Sort & View Mode */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-[#F6F7FB]/80 border border-[#E2E5F0]/80 px-3 py-1.5 rounded-xl text-xs font-medium text-[#3A416B]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#8E96B8] shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-[#8E96B8] tracking-wider">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-transparent text-xs font-medium text-[#252C4E] outline-none cursor-pointer hover:text-[#3D52A0] transition-colors"
                >
                  <option value="activity_desc">Recent Activity</option>
                  {!isDesigner && <option value="value_desc">Portfolio Value</option>}
                  <option value="projects_desc">Project Count</option>
                  <option value="name_asc">Name (A-Z)</option>
                </select>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center bg-[#EDEFF7]/80 p-0.5 rounded-xl border border-[#E2E5F0]/60">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-[#334486] shadow-2xs font-semibold' : 'text-[#8E96B8] hover:text-[#3A416B]'}`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-[#334486] shadow-2xs font-semibold' : 'text-[#8E96B8] hover:text-[#3A416B]'}`}
                  title="List Table View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons inside Directory Toolbar */}
              <div className="flex items-center gap-2 pl-1 border-l border-[#E2E5F0]/80">
                <button
                  onClick={handleExportCSV}
                  title="Export client roster to CSV"
                  className="px-3 py-1.5 bg-white hover:bg-[#F6F7FB] text-[#3A416B] hover:text-[#12182F] border border-[#E2E5F0] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#8E96B8]" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>

                <button
                  onClick={onCreateNew}
                  className="btn-primary px-3.5 py-1.5 text-white rounded-xl text-xs font-semibold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                  <span>New Project</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Lifecycle Tabs & Smart Studio Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#EDEFF7]">
            
            {/* Primary Lifecycle Tabs (Sky Blue theme) */}
            <div className="flex flex-wrap gap-1.5 items-center">
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
                    onClick={() => setSelectedBucket(bucket)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? "bg-[#EDE8F5] text-[#2A3A73] border border-[#ADBBDA] font-semibold"
                        : "bg-white hover:bg-[#F6F7FB] text-[#5A628A] border border-[#E2E5F0]"
                    }`}
                  >
                    <span>{BUCKET_CONFIG[bucket].label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
                      isSelected ? "bg-white text-[#3D52A0] border border-[#ADBBDA]" : "bg-[#F6F7FB] text-[#8E96B8] border border-[#E2E5F0]"
                    }`}>
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
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors border ${
                  selectedSmartTag !== 'all'
                    ? 'bg-[#EDE8F5] text-[#2A3A73] border-[#ADBBDA]'
                    : 'bg-white text-[#5A628A] border-[#E2E5F0] hover:text-[#12182F]'
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
                      className="bg-white rounded-2xl cd-pop p-2"
                    >
                      {[
                        { id: 'all', label: 'All accounts' },
                        { id: 'vip', label: '★ High value (over ₹25L)' },
                        { id: 'followup', label: `Touchpoint due (${stats.followupCount})` },
                        { id: 'multiproject', label: 'Multi-project' },
                        { id: 'execution', label: 'Active site' },
                        { id: 'invoice_pending', label: 'Invoiced' },
                      ].map((chip) => {
                        const isSelected = selectedSmartTag === chip.id;
                        return (
                          <button
                            key={chip.id}
                            onClick={() => { setSelectedSmartTag(chip.id as SmartFilterTag); setFiltersOpen(false); }}
                            className={`w-full text-left px-2.5 py-2 rounded-xl text-[11px] font-semibold transition-colors flex items-center justify-between ${
                              isSelected ? 'bg-[#EDE8F5] text-[#2A3A73]' : 'text-[#5A628A] hover:bg-[#F6F7FB] hover:text-[#12182F]'
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
          <div className="bg-white rounded-2xl border border-[#E2E5F0] p-12 text-center max-w-xl mx-auto my-8 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-[#EDE8F5] text-[#3D52A0] flex items-center justify-center mx-auto mb-3.5 border border-[#ADBBDA]">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#252C4E]">No client accounts found</h3>
            <p className="text-xs text-[#5A628A] mt-1 mb-5">
              {searchQuery || selectedBucket !== 'all' || selectedSmartTag !== 'all' || selectedProjectKind !== 'all'
                ? "Try clearing your search query or adjusting your filters."
                : "No client records exist in the studio yet."}
            </p>
            <div className="flex items-center justify-center gap-3">
              {(searchQuery || selectedBucket !== 'all' || selectedSmartTag !== 'all' || selectedProjectKind !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedBucket('all');
                    setSelectedSmartTag('all');
                    setSelectedProjectKind('all');
                  }}
                  className="px-3.5 py-1.5 bg-[#EDEFF7] hover:bg-[#E2E5F0] text-[#3A416B] rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
              <button
                onClick={onCreateNew}
                className="btn-primary px-4 py-1.5 text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          /*
            One table, not twenty-seven cards.

            A three-column grid of cards showed six accounts on a screen and
            made every one of them look equally important. The Drawing Tracker
            already proved the shape that works here: a named column header, a
            dense row per record, the detail opening in place.
          */
          <div className="bg-white rounded-3xl cd-panel overflow-hidden">

            <div className="hidden lg:grid grid-cols-[1.9fr_1fr_112px_1.4fr_112px_116px] gap-x-3 px-4 py-2.5 bg-[#F6F7FB] border-b border-[#E2E5F0]">
              {['Account', 'Stage', 'Status', 'Next move', 'Portfolio', ''].map((h, i) => (
                <span key={i} className={`text-[10px] font-black uppercase tracking-wider text-[#5A628A] ${i === 4 ? 'text-right' : ''}`}>{h}</span>
              ))}
            </div>

            <div className="divide-y divide-[#EDEFF7]">
              <AnimatePresence>
                {filteredAndSortedClients.map((client, index) => {
                  const clientKey = client.clientKey;
                  const isExpanded = expandedClients.has(clientKey);
                  const bConfig = BUCKET_CONFIG[client.bucket];
                  const notesCount = (clientNotes[clientKey] || []).length;
                  const stageIndex = getClientStageIndex(client);
                  const act = nextAction(client);

                  return (
                    <motion.div
                      key={clientKey}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.14, delay: Math.min(index * 0.012, 0.18) }}
                      className={`group relative transition-colors ${isExpanded ? 'bg-[#F6F7FB]' : 'hover:bg-[#F6F7FB]/70'}`}
                    >
                      <span aria-hidden className="absolute left-0 inset-y-0 w-[3px]" style={{ background: RAIL[client.bucket] }} />

                      <div className="grid grid-cols-[1fr_auto] lg:grid-cols-[1.9fr_1fr_112px_1.4fr_112px_116px] items-center gap-x-3 gap-y-2 px-4 pl-5 py-2.5">

                        {/* who */}
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(clientKey, e)}
                          className="min-w-0 text-left flex items-center gap-2.5 cursor-pointer"
                        >
                          <span
                            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px] shrink-0 text-white"
                            style={{
                              background: client.isVip
                                ? 'linear-gradient(135deg,#D9A441,#B4791F)'
                                : 'linear-gradient(135deg,#7091E6,#3D52A0)',
                            }}
                          >
                            {getInitials(client.clientName)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-[13px] text-[#12182F] truncate">{client.clientName}</span>
                              {client.isVip && <Star className="w-3 h-3 fill-amber-400 text-amber-500 shrink-0" />}
                              {client.isDummy && (
                                <span className="text-[8px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-[1px] shrink-0">Dummy</span>
                              )}
                            </span>
                            <span className="block text-[10px] text-[#8E96B8] truncate">
                              {[client.clientLocation, client.configs.join(', '), client.clientEmail || client.clientPhone].filter(Boolean).join(' · ') || 'No contact'}
                            </span>
                          </span>
                        </button>

                        {/* how far along */}
                        <div className="hidden lg:block min-w-0">
                          <div className="flex items-center gap-[3px]">
                            {LIFECYCLE_STAGES.map(stg => (
                              <span
                                key={stg.id}
                                title={`Stage ${stg.id}: ${stg.label}`}
                                className="flex-1 h-1.5 rounded-full"
                                style={{
                                  background: stg.id === stageIndex ? '#3D52A0'
                                    : stg.id < stageIndex ? '#ADBBDA' : '#EDEFF7',
                                }}
                              />
                            ))}
                          </div>
                          <span className="block text-[10px] text-[#8E96B8] mt-1 truncate">
                            {LIFECYCLE_STAGES[stageIndex - 1]?.label} · {stageIndex}/6
                          </span>
                        </div>

                        {/* what state */}
                        <div className="hidden lg:flex flex-col items-start gap-1 min-w-0">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold text-[10px] border ${bConfig.bg} ${bConfig.color} ${bConfig.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${bConfig.dot}`} />
                            {bConfig.label}
                          </span>
                          <span className="text-[10px] text-[#ADBBDA] truncate">{timeAgo(client.lastActivity)}</span>
                        </div>

                        {/* what to do about it */}
                        <p className={`hidden lg:block text-[11px] font-semibold leading-snug ${
                          act.tone === 'warn' ? 'text-amber-700' : act.tone === 'go' ? 'text-[#3D52A0]' : 'text-[#8E96B8]'
                        }`}>
                          {act.label}
                        </p>

                        {/* how much */}
                        <div className="hidden lg:block text-right">
                          <span className="block text-[14px] font-black text-[#12182F] tabular-nums leading-none">
                            {!isDesigner ? formatINR(client.totalValue) : `${client.projects.length}`}
                          </span>
                          <span className="block text-[10px] text-[#ADBBDA] mt-0.5">
                            {client.projects.length} {client.projects.length === 1 ? 'project' : 'projects'}
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
                              className="p-1.5 rounded-lg text-[#8E96B8] hover:text-[#334486] hover:bg-[#EDE8F5] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {client.projects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleCopyPortalUrl(client.projects[0].id, e)}
                              title="Copy client portal link"
                              className="p-1.5 rounded-lg text-[#8E96B8] hover:text-[#334486] hover:bg-[#EDE8F5] transition-colors cursor-pointer"
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
                                className="p-1.5 rounded-lg text-[#8E96B8] hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
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
                                      <p className="text-[10px] font-bold text-[#8E96B8] uppercase tracking-wider px-2 py-1 border-b border-[#EDEFF7]">Send WhatsApp message</p>
                                      <div className="space-y-1 mt-1">
                                        {WHATSAPP_TEMPLATES.map(tmpl => (
                                          <button
                                            key={tmpl.id}
                                            onClick={() => openWhatsAppWithTemplate(client, tmpl.template)}
                                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F6F7FB] text-xs font-semibold text-[#3A416B] transition-colors flex items-center justify-between group/w cursor-pointer"
                                          >
                                            <span>{tmpl.title}</span>
                                            <Send className="w-3 h-3 text-[#8E96B8] group-hover/w:text-emerald-600 transition-colors" />
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
                            className="p-1.5 rounded-lg text-[#8E96B8] hover:text-[#334486] hover:bg-[#EDE8F5] transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(clientKey, e)}
                            aria-expanded={isExpanded}
                            title={isExpanded ? 'Hide projects' : 'Show projects'}
                            className="p-1.5 rounded-lg text-[#8E96B8] hover:text-[#334486] transition-colors cursor-pointer"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* everything the row could not hold, on small screens */}
                      <div className="lg:hidden px-4 pl-5 pb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold text-[10px] border ${bConfig.bg} ${bConfig.color} ${bConfig.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${bConfig.dot}`} />
                          {bConfig.label}
                        </span>
                        <span className="text-[13px] font-black text-[#12182F] tabular-nums">{formatINR(client.totalValue)}</span>
                        <span className={`text-[11px] font-semibold ${act.tone === 'warn' ? 'text-amber-700' : act.tone === 'go' ? 'text-[#3D52A0]' : 'text-[#8E96B8]'}`}>{act.label}</span>
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
                            <div className="px-4 pl-5 pb-3 space-y-1.5">
                              {client.projects.map(proj => {
                                const pVal = getSingleProjectValue(proj);
                                const pStatus = proj.context?.status || 'draft';
                                const pConfig = PROJECT_STATUS_CONFIG[pStatus] || { label: pStatus, color: 'text-[#3A416B]', bg: 'bg-[#EDEFF7]', border: 'border-[#E2E5F0]' };
                                return (
                                  <button
                                    key={proj.id}
                                    type="button"
                                    onClick={() => onOpenProject(proj)}
                                    className="w-full text-left px-3 py-2 bg-white border border-[#E2E5F0] rounded-xl hover:border-[#ADBBDA] cursor-pointer transition-colors flex items-center justify-between gap-2 group/item"
                                  >
                                    <span className="min-w-0 flex-1 flex items-center gap-2">
                                      <span className="font-bold text-[12px] text-[#12182F] group-hover/item:text-[#3D52A0] truncate transition-colors">
                                        {proj.context?.name || 'Untitled project'}
                                      </span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 ${pConfig.bg} ${pConfig.color} ${pConfig.border}`}>
                                        {pConfig.label}
                                      </span>
                                      {proj.context?.config && <span className="text-[10px] text-[#8E96B8] shrink-0">{proj.context.config}</span>}
                                    </span>
                                    <span className="tabular-nums text-[12px] font-bold text-[#3A416B] shrink-0">{formatINR(pVal)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* --- LIST TABLE VIEW (Sky Blue) --- */
          <div className="bg-white rounded-2xl border border-[#E2E5F0]/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#3A416B]">
                <thead className="bg-[#F6F7FB] text-[10px] uppercase font-semibold text-[#8E96B8] border-b border-[#E2E5F0]/80">
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Projects</th>
                    {!isDesigner && <th className="px-4 py-3 text-right">Portfolio Value</th>}
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDEFF7] font-medium">
                  {filteredAndSortedClients.map((client) => {
                    const bConfig = BUCKET_CONFIG[client.bucket];
                    const stageIndex = getClientStageIndex(client);
                    return (
                      <tr key={client.clientKey} className="hover:bg-[#EDE8F5]/40 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#EDE8F5] text-[#2A3A73] flex items-center justify-center font-semibold text-xs shrink-0 border border-[#ADBBDA]/60">
                              {getInitials(client.clientName)}
                            </div>
                            <div>
                              <p className="font-semibold text-[#12182F] leading-tight">{client.clientName}</p>
                              <p className="text-[11px] text-[#8E96B8] mt-0.5">{client.clientEmail || client.clientPhone || 'No contact info'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            client.isDummy
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-[#EDE8F5] text-[#334486] border-[#ADBBDA]"
                          }`}>
                            <Pin className="w-2.5 h-2.5" />
                            {client.isDummy ? "Dummy" : "Actual"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] border ${bConfig.bg} ${bConfig.color} ${bConfig.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${bConfig.dot}`}></span>
                            {bConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[#5A628A]">{client.clientLocation || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[#334486] font-medium">{LIFECYCLE_STAGES[stageIndex - 1]?.label || 'Brief'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-[#5A628A]">{client.projects.length}</td>
                        {!isDesigner && (
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-[#12182F]">
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
                                  className="p-1.5 rounded-lg text-[#5A628A] hover:text-[#334486] hover:bg-[#EDE8F5] border border-[#E2E5F0]/70 transition-colors cursor-pointer"
                                >
                                  {copiedId === "portal-" + client.projects[0].id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Globe className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => onOpenProject(client.projects[0])}
                                  className="px-2.5 py-1 text-xs font-semibold text-[#334486] bg-[#EDE8F5] hover:bg-[#E2E5F0] rounded-lg border border-[#ADBBDA] transition-colors cursor-pointer"
                                >
                                  Open
                                </button>
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
              className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col justify-between border-l border-[#E2E5F0]"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-[#EDEFF7] flex items-start justify-between bg-[#F6F7FB]/60">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#EDE8F5] text-[#334486] border border-[#ADBBDA] flex items-center justify-center font-bold text-sm">
                    {getInitials(dossierClient.clientName)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#12182F]">{dossierClient.clientName}</h3>
                    <p className="text-xs text-[#5A628A] mt-0.5">
                      {dossierClient.clientLocation || "No location specified"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDossierClient(null)}
                  className="p-1.5 rounded-lg text-[#8E96B8] hover:text-[#3A416B] hover:bg-[#EDEFF7] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                {/* Vitals Summary */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-[#F6F7FB] border border-[#E2E5F0]/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-[#8E96B8] block">Total Portfolio</span>
                    <span className="text-sm font-bold text-[#12182F] tabular-nums mt-0.5 block">
                      {formatINR(dossierClient.totalValue)}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F6F7FB] border border-[#E2E5F0]/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-[#8E96B8] block">Linked Sites</span>
                    <span className="text-sm font-bold text-[#12182F] mt-0.5 block">
                      {dossierClient.projects.length} Project{dossierClient.projects.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Contact Records */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#12182F] block uppercase tracking-wider">Contact Records</span>
                  <div className="bg-[#F6F7FB] border border-[#E2E5F0]/70 rounded-xl p-3.5 space-y-2.5 text-xs text-[#3A416B]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8E96B8] flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                      <span className="font-medium text-[#12182F] select-all">{dossierClient.clientEmail || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#8E96B8] flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                      <span className="font-medium text-[#12182F] select-all">{dossierClient.clientPhone || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Studio Internal Notes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#12182F] uppercase tracking-wider">Internal Studio Notes</span>
                    <span className="text-[10px] text-[#8E96B8]">
                      {(clientNotes[dossierClient.clientKey] || []).length} recorded
                    </span>
                  </div>

                  {/* Add Note Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add an internal studio note or preference..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNote(dossierClient.clientKey);
                      }}
                      className="flex-1 px-3 py-2 bg-[#F6F7FB] border border-[#E2E5F0] rounded-xl text-xs outline-none focus:bg-white focus:border-[#3D52A0]"
                    />
                    <button
                      onClick={() => handleAddNote(dossierClient.clientKey)}
                      disabled={!newNoteText.trim()}
                      className="px-3.5 py-2 bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Save
                    </button>
                  </div>

                  {/* Notes Feed */}
                  <div className="space-y-2 pt-1 max-h-56 overflow-y-auto">
                    {(clientNotes[dossierClient.clientKey] || []).length === 0 ? (
                      <p className="text-xs text-[#8E96B8] italic py-2 text-center">No internal notes for this client yet.</p>
                    ) : (
                      (clientNotes[dossierClient.clientKey] || []).map((note) => (
                        <div key={note.id} className="p-3 bg-[#F6F7FB] border border-[#E2E5F0]/60 rounded-xl flex items-start justify-between gap-2 text-xs">
                          <div>
                            <p className="text-[#252C4E] leading-relaxed">{note.text}</p>
                            <p className="text-[10px] text-[#8E96B8] mt-1">
                              By <span className="font-medium text-[#5A628A]">{note.author}</span> • {timeAgo(note.createdAt)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(dossierClient.clientKey, note.id)}
                            className="text-[#ADBBDA] hover:text-rose-500 p-1 transition-colors cursor-pointer"
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
              <div className="p-4 border-t border-[#EDEFF7] bg-[#F6F7FB]/80 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8E96B8]">
                  Last active {timeAgo(dossierClient.lastActivity)}
                </span>
                <div className="flex items-center gap-2">
                  {dossierClient.projects[0] && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPortalUrl(dossierClient.projects[0].id, e, false)}
                        className="px-3 py-2 bg-white hover:bg-[#F6F7FB] border border-[#E2E5F0] text-[#3A416B] font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
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
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPortalUrl(dossierClient.projects[0].id, e, true)}
                        className="px-3 py-2 bg-white hover:bg-[#F6F7FB] border border-[#E2E5F0] text-[#3A416B] font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Generate a brand new link and revoke earlier links"
                      >
                        {copiedId === "newportal-" + dossierClient.projects[0].id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>New Link Copied</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Reissue Link</span>
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
                      <span>Open Active Project</span>
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
