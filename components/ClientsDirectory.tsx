import React, { useState, useMemo } from "react";
import { FullProjectData } from "../types";
import { formatINR, timeAgo } from "../lib/utils";
import { getSingleProjectValue } from "../lib/financialsUtils";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "../contexts/OrgContext";
import { usePageHeader } from "../contexts/PageHeaderContext";
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
  Pin,
  Sparkles,
  Check
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
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    dot: "bg-slate-400"
  },
  active: {
    label: "Active Site",
    color: "text-sky-950",
    bg: "bg-sky-50/80",
    border: "border-sky-200",
    dot: "bg-sky-600"
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
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    dot: "bg-slate-400"
  }
};

const PROJECT_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  lead: { label: "Discovery", color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200" },
  draft: { label: "Drafting", color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200" },
  proposal_sent: { label: "Proposal", color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  negotiation: { label: "Negotiation", color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  won: { label: "Contracted", color: "text-sky-950", bg: "bg-sky-50", border: "border-sky-200" },
  execution: { label: "On Site", color: "text-sky-950", bg: "bg-sky-50", border: "border-sky-200" },
  work_paused: { label: "Paused", color: "text-rose-800", bg: "bg-rose-50", border: "border-rose-200" },
  completed: { label: "Handed Over", color: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-200" },
  lost: { label: "Lost", color: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" },
  archived: { label: "Archived", color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200" },
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
  const [selectedProjectKind, setSelectedProjectKind] = useState<ProjectKindFilter>('all');
  const [selectedSmartTag, setSelectedSmartTag] = useState<SmartFilterTag>('all');
  const [sortBy, setSortBy] = useState<SortOption>('activity_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getClientPortalUrl = (projectId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/?portal=${projectId}`;
  };

  const handleCopyPortalUrl = (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getClientPortalUrl(projectId);
    navigator.clipboard.writeText(url);
    setCopiedId("portal-" + projectId);
    setTimeout(() => setCopiedId(null), 2000);
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

      const groupKey = (clientEmail || clientName).toLowerCase().trim();
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

  // Compute summary stats
  const stats = useMemo(() => {
    let total = aggregatedClients.length;
    let actualCount = 0;
    let dummyCount = 0;
    let pipeline = 0;
    let active = 0;
    let delivered = 0;
    let lost = 0;
    let openValue = 0;
    let multiProjectCount = 0;
    let vipCount = 0;
    let followupCount = 0;

    for (const c of aggregatedClients) {
      if (c.isDummy) dummyCount++;
      else actualCount++;

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
  }, [aggregatedClients]);

  // Determine stage progress for each client (1 to 6)
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
      { label: "Accounts", value: `${stats.total}` },
      { label: "Actual", value: `${stats.actualCount}` },
      { label: "Active & Sites", value: `${stats.active}` },
      { label: "Delivered", value: `${stats.delivered}` },
      { 
        label: !isDesigner ? "Active Portfolio" : "Multi-Project", 
        value: !isDesigner ? formatINR(stats.openValue) : `${stats.multiProjectCount} Accounts`,
        tone: stats.openValue > 0 ? "good" : undefined 
      }
    ]
  }, [stats.total, stats.actualCount, stats.active, stats.delivered, stats.openValue, stats.multiProjectCount, isDesigner]);

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
    <div className="flex flex-col h-full bg-slate-50/40 text-slate-900">
      
      {/* 1. FILTER & SEARCH TOOLBAR (Sky Blue Theme + Actual/Dummy Filter) */}
      <div className="px-4 lg:px-8 pt-2 pb-4">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-3">
          
          {/* Row 1: Search + Actual/Dummy Switcher + Sort + View Mode */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by client name, email, phone, city, or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9.5 pr-8 py-2 bg-slate-50/60 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-100 transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Actual vs Dummy Filter Pill */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/70 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedProjectKind('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedProjectKind === 'all'
                    ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setSelectedProjectKind('actual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedProjectKind === 'actual'
                    ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Pin className="w-3 h-3 text-sky-200" />
                <span>Actual ({stats.actualCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedProjectKind('dummy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedProjectKind === 'dummy'
                    ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Dummy ({stats.dummyCount})</span>
              </button>
            </div>

            {/* Sort & View Mode */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer hover:text-sky-600 transition-colors"
                >
                  <option value="activity_desc">Recent Activity</option>
                  {!isDesigner && <option value="value_desc">Portfolio Value</option>}
                  <option value="projects_desc">Project Count</option>
                  <option value="name_asc">Name (A-Z)</option>
                </select>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-sky-700 shadow-2xs font-semibold' : 'text-slate-400 hover:text-slate-700'}`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-sky-700 shadow-2xs font-semibold' : 'text-slate-400 hover:text-slate-700'}`}
                  title="List Table View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons inside Directory Toolbar */}
              <div className="flex items-center gap-2 pl-1 border-l border-slate-200/80">
                <button
                  onClick={handleExportCSV}
                  title="Export client roster to CSV"
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
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
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100">
            
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
                        ? "bg-sky-600 text-white shadow-2xs font-semibold"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60"
                    }`}
                  >
                    <span>{BUCKET_CONFIG[bucket].label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? "bg-sky-700 text-sky-100" : "bg-white text-slate-500 border border-slate-200/60"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Smart Studio Filter Tag Chips */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-0.5">
                <Tag className="w-3 h-3 text-slate-400" />
                Filter:
              </span>

              {[
                { id: 'all', label: 'All' },
                { id: 'vip', label: '★ High Value (>₹25L)' },
                { id: 'followup', label: `Touchpoint Due (${stats.followupCount})` },
                { id: 'multiproject', label: 'Multi-Project' },
                { id: 'execution', label: 'Active Site' },
                { id: 'invoice_pending', label: 'Invoiced' },
              ].map((chip) => {
                const isSelected = selectedSmartTag === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setSelectedSmartTag(chip.id as SmartFilterTag)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "bg-sky-50 text-sky-900 border border-sky-200 font-semibold"
                        : "bg-white text-slate-600 border border-slate-200/70 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN DIRECTORY ROSTER */}
      <div className="px-4 lg:px-8 pb-16 flex-1">
        {filteredAndSortedClients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-8 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-3.5 border border-sky-200">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No client accounts found</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
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
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
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
          /* --- REFINED SKY BLUE THEMED CARD GRID VIEW --- */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredAndSortedClients.map((client, index) => {
                const clientKey = client.clientKey;
                const isExpanded = expandedClients.has(clientKey);
                const bConfig = BUCKET_CONFIG[client.bucket];
                const notesCount = (clientNotes[clientKey] || []).length;
                const stageIndex = getClientStageIndex(client);

                return (
                  <motion.div
                    key={clientKey}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                    className="bg-white rounded-2xl border border-slate-200/80 hover:border-sky-300 transition-all shadow-xs hover:shadow-sm flex flex-col justify-between overflow-hidden group relative"
                  >
                    <div className="p-5 flex flex-col gap-4">
                      
                      {/* 1. Header Identity, Actual/Dummy Animated Note & Value */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Subtle Initials Avatar */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-xs shrink-0 ${
                            client.isVip 
                              ? "bg-amber-50/80 text-amber-900 border border-amber-200" 
                              : "bg-sky-50 text-sky-800 border border-sky-200/70"
                          }`}>
                            {getInitials(client.clientName)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold text-sm text-slate-900 leading-snug truncate">
                                {client.clientName}
                              </h3>
                              {client.isVip && (
                                <span title="High Value Client (>₹25L)" className="text-amber-500 shrink-0">
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                </span>
                              )}

                              {/* Waving Pinned Note Tag: Actual vs Dummy */}
                              <motion.div
                                animate={{ rotate: [0, -3, 3, -2, 2, 0] }}
                                transition={{
                                  repeat: Infinity,
                                  repeatDelay: 4 + (index % 3),
                                  duration: 1.8,
                                  ease: "easeInOut"
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shadow-2xs origin-top-left ${
                                  client.isDummy
                                    ? "bg-amber-50 text-amber-800 border-amber-200/90"
                                    : "bg-sky-50 text-sky-700 border-sky-200/90"
                                }`}
                                title={client.isDummy ? "Sample / Demo Project Data" : "Verified Live Studio Client"}
                              >
                                <Pin className={`w-2.5 h-2.5 ${client.isDummy ? "text-amber-600" : "text-sky-600"}`} />
                                <span>{client.isDummy ? "Dummy" : "Actual"}</span>
                              </motion.div>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              {client.clientLocation && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  {client.clientLocation}
                                </span>
                              )}
                              {client.configs.length > 0 && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="truncate">{client.configs.join(", ")}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Financial Value or Project Count */}
                        <div className="text-right shrink-0">
                          {!isDesigner ? (
                            <>
                              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider leading-none mb-1">
                                Portfolio
                              </p>
                              <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums leading-none">
                                {formatINR(client.totalValue)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider leading-none mb-1">
                                Scope
                              </p>
                              <p className="text-xs font-semibold text-slate-800 leading-none">
                                {client.projects.length} {client.projects.length === 1 ? "Project" : "Projects"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 2. Smart Status & Stage Progress Pip Bar */}
                      <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[10px] border ${bConfig.bg} ${bConfig.color} ${bConfig.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${bConfig.dot}`}></span>
                              {bConfig.label}
                            </span>

                            {client.needsFollowup && (
                              <span 
                                title={`No activity for ${client.daysIdle} days`}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200"
                              >
                                Touchpoint Due ({client.daysIdle}d)
                              </span>
                            )}
                          </div>

                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {timeAgo(client.lastActivity)}
                          </span>
                        </div>

                        {/* 6-Stage Progress Pips */}
                        <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-1">
                          {LIFECYCLE_STAGES.map((stg) => {
                            const isPast = stg.id < stageIndex;
                            const isCurrent = stg.id === stageIndex;

                            return (
                              <div 
                                key={stg.id} 
                                className="flex-1 flex flex-col items-center gap-1 group/pip relative"
                                title={`Stage ${stg.id}: ${stg.label}`}
                              >
                                <div className={`w-full h-1 rounded-full transition-all ${
                                  isCurrent
                                    ? "bg-sky-600"
                                    : isPast
                                    ? "bg-slate-300"
                                    : "bg-slate-200/60"
                                }`} />
                                <span className={`text-[8px] tracking-tight leading-none ${
                                  isCurrent 
                                    ? "font-semibold text-sky-700" 
                                    : isPast 
                                    ? "text-slate-500 font-normal" 
                                    : "text-slate-400"
                                }`}>
                                  {stg.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3. Subtle Portal & Studio Quick Actions Strip */}
                      <div className="pt-1 flex items-center justify-between gap-2">
                        
                        {/* Contact details */}
                        <div className="min-w-0 flex items-center gap-2 text-xs text-slate-500">
                          {client.clientPhone ? (
                            <a 
                              href={`tel:${client.clientPhone}`}
                              className="hover:text-sky-700 flex items-center gap-1 truncate"
                              title="Call Client"
                            >
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{client.clientPhone}</span>
                            </a>
                          ) : client.clientEmail ? (
                            <a 
                              href={`mailto:${client.clientEmail}`}
                              className="hover:text-sky-700 flex items-center gap-1 truncate"
                              title="Email Client"
                            >
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{client.clientEmail}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No contact added</span>
                          )}
                        </div>

                        {/* Action Icons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Portal Copy / Open */}
                          {client.projects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleCopyPortalUrl(client.projects[0].id, e)}
                              title="Copy Client Portal URL"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 border border-slate-200/70 transition-colors cursor-pointer"
                            >
                              {copiedId === "portal-" + client.projects[0].id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Globe className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {/* WhatsApp Template Launcher */}
                          {client.clientPhone && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveWhatsAppMenu(activeWhatsAppMenu === clientKey ? null : clientKey)}
                                title="WhatsApp Quick Scripts"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200/70 transition-colors cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>

                              {/* WhatsApp Template Popover */}
                              <AnimatePresence>
                                {activeWhatsAppMenu === clientKey && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-40" 
                                      onClick={() => setActiveWhatsAppMenu(null)}
                                    />
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                      className="absolute right-0 bottom-full mb-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 p-2 z-50 text-left"
                                    >
                                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-100">
                                        Send WhatsApp Message
                                      </p>
                                      <div className="space-y-1 mt-1">
                                        {WHATSAPP_TEMPLATES.map((tmpl) => (
                                          <button
                                            key={tmpl.id}
                                            onClick={() => openWhatsAppWithTemplate(client, tmpl.template)}
                                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors flex items-center justify-between group/w cursor-pointer"
                                          >
                                            <span>{tmpl.title}</span>
                                            <Send className="w-3 h-3 text-slate-400 group-hover/w:text-emerald-600 transition-colors" />
                                          </button>
                                        ))}
                                      </div>
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Client Dossier Notes */}
                          <button
                            type="button"
                            onClick={() => setDossierClient(client)}
                            title="View Client Dossier & Studio Notes"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 border border-slate-200/70 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 4. Expandable Linked Projects Drawer */}
                    <div className="bg-slate-50/60 border-t border-slate-100 px-5 py-2.5">
                      <div 
                        onClick={(e) => toggleExpand(clientKey, e)}
                        className="flex justify-between items-center cursor-pointer select-none py-0.5 text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          {client.projects.length} {client.projects.length === 1 ? "Project" : "Projects"}
                          {notesCount > 0 && (
                            <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded font-normal normal-case border border-amber-200">
                              {notesCount} note{notesCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                        <div>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden mt-2"
                          >
                            <div className="space-y-1.5 pt-2 border-t border-slate-200/60 pb-1">
                              {client.projects.map((proj) => {
                                const pVal = getSingleProjectValue(proj);
                                const pStatus = proj.context?.status || 'draft';
                                const pConfig = PROJECT_STATUS_CONFIG[pStatus] || { label: pStatus, color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200" };

                                return (
                                  <div 
                                    key={proj.id} 
                                    onClick={() => onOpenProject(proj)}
                                    className="p-2.5 bg-white border border-slate-200/70 rounded-xl hover:border-sky-300 hover:shadow-2xs cursor-pointer transition-all flex items-center justify-between gap-2 group/item"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-xs text-slate-900 group-hover/item:text-sky-600 leading-snug truncate transition-colors">
                                        {proj.context?.name || "Untitled Project"}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-semibold uppercase tracking-wider border ${pConfig.bg} ${pConfig.color} ${pConfig.border}`}>
                                          {pConfig.label}
                                        </span>
                                        {proj.context?.config && (
                                          <span className="text-[10px] text-slate-400">
                                            {proj.context.config}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="font-mono text-xs font-semibold text-slate-700 shrink-0">
                                      {formatINR(pVal)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          /* --- LIST TABLE VIEW (Sky Blue) --- */
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-200/80">
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
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredAndSortedClients.map((client) => {
                    const bConfig = BUCKET_CONFIG[client.bucket];
                    const stageIndex = getClientStageIndex(client);
                    return (
                      <tr key={client.clientKey} className="hover:bg-sky-50/40 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-800 flex items-center justify-center font-semibold text-xs shrink-0 border border-sky-200/60">
                              {getInitials(client.clientName)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 leading-tight">{client.clientName}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{client.clientEmail || client.clientPhone || 'No contact info'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            client.isDummy
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-sky-50 text-sky-700 border-sky-200"
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
                        <td className="px-4 py-3.5 text-slate-500">{client.clientLocation || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-sky-700 font-medium">{LIFECYCLE_STAGES[stageIndex - 1]?.label || 'Brief'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{client.projects.length}</td>
                        {!isDesigner && (
                          <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                            {formatINR(client.totalValue)}
                          </td>
                        )}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {client.projects[0] && (
                              <button
                                onClick={() => onOpenProject(client.projects[0])}
                                className="px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors cursor-pointer"
                              >
                                Open
                              </button>
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
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-2xs"
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
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-sm">
                    {getInitials(dossierClient.clientName)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{dossierClient.clientName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dossierClient.clientLocation || "No location specified"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDossierClient(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                {/* Vitals Summary */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Portfolio</span>
                    <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">
                      {formatINR(dossierClient.totalValue)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Linked Sites</span>
                    <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                      {dossierClient.projects.length} Project{dossierClient.projects.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Contact Records */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 block uppercase tracking-wider">Contact Records</span>
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2.5 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                      <span className="font-medium text-slate-900 select-all">{dossierClient.clientEmail || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                      <span className="font-medium text-slate-900 select-all">{dossierClient.clientPhone || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Studio Internal Notes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Internal Studio Notes</span>
                    <span className="text-[10px] text-slate-400">
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
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-sky-500"
                    />
                    <button
                      onClick={() => handleAddNote(dossierClient.clientKey)}
                      disabled={!newNoteText.trim()}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Save
                    </button>
                  </div>

                  {/* Notes Feed */}
                  <div className="space-y-2 pt-1 max-h-56 overflow-y-auto">
                    {(clientNotes[dossierClient.clientKey] || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2 text-center">No internal notes for this client yet.</p>
                    ) : (
                      (clientNotes[dossierClient.clientKey] || []).map((note) => (
                        <div key={note.id} className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex items-start justify-between gap-2 text-xs">
                          <div>
                            <p className="text-slate-800 leading-relaxed">{note.text}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              By <span className="font-medium text-slate-600">{note.author}</span> • {timeAgo(note.createdAt)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(dossierClient.clientKey, note.id)}
                            className="text-slate-300 hover:text-rose-500 p-1 transition-colors cursor-pointer"
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
              <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Last active {timeAgo(dossierClient.lastActivity)}
                </span>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
