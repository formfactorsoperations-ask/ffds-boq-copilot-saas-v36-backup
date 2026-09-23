import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ProjectContext } from '../types';
import { useOrg } from '../contexts/OrgContext';
import { 
  PROJECT_DOCUMENTS, 
  DocMeta, 
  buildSigningUrl, 
  getSigningToken 
} from '../lib/documentActions';
import ClientDocumentBoard from './documents/ClientDocumentBoard';
import { getQueries } from '../services/documentQueryEngine';
import { RELEASABLE_DOCUMENTS } from '../services/documentReleaseEngine';
import { resolveDocumentState } from '../services/documentIssueEngine';
import { FullProjectData } from '../types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { 
  Search, 
  MoreVertical, 
  ExternalLink, 
  Copy, 
  Download, 
  Send, 
  Check, 
  Lock, 
  FileText, 
  Activity, 
  Clock, 
  AlertCircle,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';

interface DocumentsHubProps {
  projectContext: ProjectContext;
  onNavigate: (tab: string) => void;
  projectId?: string;
  activeTab?: string;
  /** Required to release documents and answer client questions. */
  setProjectContext?: (updater: any) => void;
  projectData?: FullProjectData;
}

export default function DocumentsHub({ projectContext, onNavigate, projectId, activeTab, setProjectContext, projectData }: DocumentsHubProps) {
  // Client-facing document control. Read-only callers (previews) keep the plain
  // document list; anything that can write gets the release + questions view.
  const openQueryCount = getQueries(projectContext).filter(q => q.status === 'open').length;

  // Documents released to the client and still unsigned, plus anything never
  // sent at all. This is the work the studio actually has to do.
  const clientDocAttention = useMemo(() => {
    let waiting = 0;
    RELEASABLE_DOCUMENTS.forEach(d => {
      const st = resolveDocumentState(projectContext, d.kind);
      if (st === 'issued' || st === 'viewed' || st === 'queried' || st === 'amended') waiting += 1;
    });
    return waiting;
  }, [projectContext]);

  const actualProjectId = projectId || (projectContext as any)?.id;

  const { orgData } = useOrg();
  const isDesigner = orgData?.role === 'designer';
  const lifecycle = projectContext?.lifecycle;
  const currentStage = lifecycle?.stage || 1;
  const isExecutionGateOpen = !!lifecycle?.gates?.designGateActive?.done;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  const [moms, setMoms] = useState<any[]>([]);

  useEffect(() => {
    // `db` is null when Firebase is not configured (local / offline mode).
    // collection(null, ...) throws, which previously took the whole Documents
    // page down; guard it so the page still works without a backend.
    if (!actualProjectId || !orgData?.tenantId || !db) return;
    try {
      const momsRef = collection(db, `organizations/${orgData.tenantId}/projects/${actualProjectId}/moms`);
      const unsubscribe = onSnapshot(momsRef, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMoms(data);
      }, () => { /* listener errors are non-fatal for this page */ });
      return () => unsubscribe();
    } catch {
      /* no backend — MOM summary simply stays empty */
    }
  }, [actualProjectId, orgData?.tenantId]);

  const momSummary = useMemo(() => {
    const totalCount = moms.length;
    const finalizedCount = moms.filter(m => m.status === 'finalised' || m.status === 'shared' || m.status === 'acknowledged').length;
    const draftCount = moms.filter(m => m.status === 'draft').length;
    const openTasksCount = moms.reduce((acc, m) => acc + (m.actionItems?.filter((a: any) => a.status === 'open').length || 0), 0);
    return { totalCount, finalizedCount, draftCount, openTasksCount };
  }, [moms]);

  // Close dropdown menu when clicking outside
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Derive status details for each document based on live ProjectContext
  const docRows = useMemo(() => {
    return PROJECT_DOCUMENTS.map((doc) => {
      const isAvailable = currentStage >= doc.minStage;
      const isGateLocked = !!(doc.gateGated && !isExecutionGateOpen);

      // Default state for locked/unavailable documents
      if (isGateLocked) {
        return {
          ...doc,
          isAvailable: false,
          isGateLocked: true,
          statusLabel: 'Gate Locked',
          tone: 'locked' as const,
          detail: 'Unlocks after Design Complete Gate'
        };
      }

      if (!isAvailable) {
        return {
          ...doc,
          isAvailable: false,
          isGateLocked: false,
          statusLabel: 'Not Yet Due',
          tone: 'pending' as const,
          detail: `Requires Stage ${doc.minStage} — current stage is ${currentStage}`
        };
      }

      // A document that has been released to the client has exactly one true
      // state, held by the issue engine. The legacy rules below read
      // engagement.status, onboardingData, termsDockets and others — none of
      // which move when a document is released, which is why "Send to client"
      // left the status showing Draft.
      if (doc.documentKind) {
        const issueState = resolveDocumentState(projectContext, doc.documentKind);
        const map: Record<string, { statusLabel: string; tone: 'draft' | 'sent' | 'signed'; detail: string }> = {
          issued:   { statusLabel: 'Sent',      tone: 'sent',   detail: 'Released to the client — not opened yet' },
          viewed:   { statusLabel: 'Opened',    tone: 'sent',   detail: 'Client has opened it, not signed' },
          queried:  { statusLabel: 'Question',  tone: 'sent',   detail: 'Client asked about a clause' },
          amended:  { statusLabel: 'Re-issued', tone: 'sent',   detail: 'Awaiting the client to re-read' },
          signed:   { statusLabel: 'Signed',    tone: 'signed', detail: 'Signed by the client' },
          executed: { statusLabel: 'Executed',  tone: 'signed', detail: 'Signed by both parties' }
        };
        const hit = map[issueState];
        if (hit) return { ...doc, isAvailable: true, isGateLocked: false, ...hit };
      }

      // Live status mapping
      switch (doc.id) {
        case 'client': {
          const isApproved = !!projectContext?.approvedTierId;
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: isApproved ? 'Approved' : 'Draft',
            tone: isApproved ? ('signed' as const) : ('draft' as const),
            detail: isApproved ? 'Proposal approved by client' : 'Awaiting client selection'
          };
        }


        case 'contract':
        case 'terms-docket':
        case 'execution-agreement':
        case 'handover-docket': {
          const field = doc.signable?.field;
          if (!field) {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Draft',
              tone: 'draft' as const,
              detail: 'Document draft created'
            };
          }
          const signoff = projectContext ? (projectContext[field] as any) : undefined;
          const status = signoff?.status || 'pending';

          if (status === 'signed') {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Signed',
              tone: 'signed' as const,
              detail: signoff.signedAt ? `Signed on ${new Date(signoff.signedAt).toLocaleDateString()}` : 'Executed digitally'
            };
          }
          if (status === 'sent') {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Awaiting Sign',
              tone: 'sent' as const,
              detail: signoff.sentAt ? `Sent on ${new Date(signoff.sentAt).toLocaleDateString()}` : 'Awaiting client signature'
            };
          }
          if (status === 'disputed') {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Disputed',
              tone: 'draft' as const,
              detail: 'Client requested revisions'
            };
          }
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: 'Draft',
            tone: 'draft' as const,
            detail: 'Ready to send for signature'
          };
        }

        case 'payment-schedule': {
          const engStatus = (projectContext as any)?.engagement?.status || 'pending';
          if (engStatus === 'acknowledged') {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Acknowledged',
              tone: 'signed' as const,
              detail: 'Payment schedule acknowledged'
            };
          }
          if (engStatus === 'issued') {
            return {
              ...doc,
              isAvailable: true,
              isGateLocked: false,
              statusLabel: 'Issued',
              tone: 'sent' as const,
              detail: 'Issued to client'
            };
          }
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: 'Draft',
            tone: 'draft' as const,
            detail: 'Schedule is being configured'
          };
        }

        case 'onboarding': {
          const onboardStatus = (projectContext?.onboardingData as any)?.completed || projectContext?.onboardingData?.accountName ? 'completed' : 'draft';
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: onboardStatus === 'completed' ? 'Finalized' : 'Draft',
            tone: onboardStatus === 'completed' ? ('signed' as const) : ('draft' as const),
            detail: onboardStatus === 'completed' ? 'Onboarding kit completed' : 'Awaiting configuration'
          };
        }

        case 'update-client-feed': {
          const count = projectContext?.projectUpdates?.length || 0;
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: count > 0 ? `${count} Sent` : 'Draft',
            tone: count > 0 ? ('signed' as const) : ('draft' as const),
            detail: count > 0 ? `${count} Weekly report(s) posted` : 'No updates sent yet'
          };
        }

        case 'snaglist': {
          const count = projectContext?.snagList?.length || 0;
          const resolvedCount = projectContext?.snagList?.filter((s: any) => s.status === 'resolved' || s.status === 'verified').length || 0;
          const openCount = count - resolvedCount;
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: count > 0 ? (openCount === 0 ? 'Resolved' : `${openCount} Open`) : 'Clean',
            tone: count > 0 ? (openCount === 0 ? ('signed' as const) : ('sent' as const)) : ('draft' as const),
            detail: count > 0 ? `${resolvedCount}/${count} defects resolved` : 'No defects logged'
          };
        }

        case 'checklist': {
          const rooms = (projectContext?.rooms || []).filter((r: any) => r && typeof r === 'object');
          const checkedState = (projectContext?.qualityChecklist?.checkedState && typeof projectContext?.qualityChecklist?.checkedState === 'object')
            ? projectContext.qualityChecklist.checkedState
            : {};
          const naState = (projectContext?.qualityChecklist?.naState && typeof projectContext?.qualityChecklist?.naState === 'object')
            ? projectContext.qualityChecklist.naState
            : {};
          
          let totalChecks = 0;
          let checkedCount = 0;

          rooms.forEach((room: any) => {
            if (!room) return;
            const rId = room.id || room.name;
            if (!rId) return;
            const roomNAs = (naState[rId] && typeof naState[rId] === 'object') ? naState[rId] : {};
            // 6 standard checks minus any marked as N/A
            const applicableStandardCount = 6 - Object.keys(roomNAs).filter(k => roomNAs[k]).length;
            totalChecks += applicableStandardCount;

            const roomChecks = (checkedState[rId] && typeof checkedState[rId] === 'object') ? checkedState[rId] : {};
            Object.entries(roomChecks).forEach(([checkId, checked]) => {
              if (checked && !roomNAs[checkId]) {
                checkedCount++;
              }
            });
          });

          const customChecks = Array.isArray(projectContext?.qualityChecklist?.customChecks)
            ? projectContext.qualityChecklist.customChecks
            : [];
          totalChecks += customChecks.length;
          checkedCount += customChecks.filter(c => c && c.checked).length;

          const pct = totalChecks > 0 ? Math.round((checkedCount / totalChecks) * 100) : 100;
          const statusLabel = checkedCount === 0 ? 'Not Started' : checkedCount === totalChecks ? 'Complete' : `${pct}% Done`;
          const tone = checkedCount === 0 ? ('draft' as const) : checkedCount === totalChecks ? ('signed' as const) : ('sent' as const);

          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel,
            tone,
            detail: totalChecks > 0 ? `${checkedCount}/${totalChecks} checkpoints verified` : 'No checkpoints configured'
          };
        }

        case 'payment-calc': {
          const milestones = projectContext?.paymentMilestones || [];
          const paidCount = milestones.filter((m: any) => m.status === 'paid').length;
          const invoicedCount = milestones.filter((m: any) => m.status === 'invoiced').length;
          
          let detail = 'No active invoices';
          let tone: 'signed' | 'sent' | 'draft' | 'locked' | 'pending' = 'draft';
          let statusLabel = 'Draft';

          if (paidCount > 0 && invoicedCount > 0) {
            detail = `${paidCount} Paid • ${invoicedCount} Sent`;
            tone = 'signed' as const;
            statusLabel = 'Active';
          } else if (paidCount > 0) {
            detail = `${paidCount} Invoice(s) Paid`;
            tone = 'signed' as const;
            statusLabel = 'Paid';
          } else if (invoicedCount > 0) {
            detail = `${invoicedCount} Invoice(s) Sent`;
            tone = 'sent' as const;
            statusLabel = 'Sent';
          }

          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel,
            tone,
            detail
          };
        }

        case 'mom-action-tracker': {
          const count = momSummary.totalCount;
          const statusLabel = momSummary.finalizedCount > 0 ? `${momSummary.finalizedCount} Issued` : 'Draft';
          const tone = momSummary.finalizedCount > 0 ? ('signed' as const) : ('draft' as const);
          let detail = 'Record meeting logs and action items';
          if (count > 0) {
            detail = `${momSummary.finalizedCount} finalized of ${count} total meetings (${momSummary.openTasksCount} open tasks)`;
          }
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel,
            tone,
            detail
          };
        }

        default:
          return {
            ...doc,
            isAvailable: true,
            isGateLocked: false,
            statusLabel: 'Draft',
            tone: 'draft' as const,
            detail: 'Ready'
          };
      }
    });
  }, [projectContext, currentStage, isExecutionGateOpen]);

  // Apply Designer visibility restrictions
  const visibleRows = useMemo(() => {
    return docRows.filter(row => !(isDesigner && row.money));
  }, [docRows, isDesigner]);

  // Apply Search Filtering
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return visibleRows;
    const query = searchQuery.toLowerCase();
    return visibleRows.filter(row => 
      row.name.toLowerCase().includes(query) || 
      row.group.toLowerCase().includes(query) ||
      row.statusLabel.toLowerCase().includes(query)
    );
  }, [visibleRows, searchQuery]);

  // Dynamic Grouping
  const groupedDocs = useMemo(() => {
    const groups: Record<string, typeof filteredRows> = {
      'Proposal': [],
      'Agreement & Design': [],
      'Execution': []
    };
    filteredRows.forEach(row => {
      if (groups[row.group]) {
        groups[row.group].push(row);
      }
    });
    return groups;
  }, [filteredRows]);

  // Metrics summary
  const summaryMetrics = useMemo(() => {
    let finalized = 0;
    let inProgress = 0;
    let notYetDue = 0;

    visibleRows.forEach(row => {
      if (row.tone === 'signed') finalized++;
      else if (row.tone === 'sent' || row.tone === 'draft') inProgress++;
      else notYetDue++;
    });

    return { finalized, inProgress, notYetDue };
  }, [visibleRows]);

  const handleCopySigningLink = (docId: string, token: string | undefined) => {
    if (!token) return;
    const url = buildSigningUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedDocId(docId);
      setTimeout(() => setCopiedDocId(null), 2500);
      setActiveMenuId(null);
    });
  };

  const getToneClasses = (tone: 'signed' | 'sent' | 'draft' | 'locked' | 'pending') => {
    switch (tone) {
      case 'signed':
        return 'bg-emerald-50/80 text-emerald-800 border border-emerald-200/50';
      case 'sent':
        return 'bg-sky-50/80 text-[#334486] border border-sky-200/50';
      case 'draft':
        return 'bg-amber-50/80 text-amber-800 border border-amber-200/50';
      case 'locked':
        return 'bg-slate-50 text-slate-500 border border-slate-200/40';
      default:
        return 'bg-slate-50 text-slate-400 border border-slate-200/30';
    }
  };

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 lg:px-8 pb-12 animate-in fade-in duration-300">
      
      {/*
        The page header and the board beneath it were speaking different
        languages: a gradient icon tile, a text-2xl title, emoji standing in for
        icons and three tall cards carrying one number each — above a board that
        is square-edged, dense and set at 13px. The header is now the same
        product as the thing it introduces.
      */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80"
      >
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#3D52A0]" />
            Client documents
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Every contract and docket on this project, and whose move it is on each.
          </p>
        </div>

        {/*
          The search moved into the register's own filter bar.

          It lived here, full width, and fed `groupedDocs` — which renders only
          in the read-only fallback below. In the studio view, the one this
          header actually sits above, typing in it filtered nothing at all. It
          now sits beside the filters it belongs with, on the component that
          owns the rows.
        */}
      </motion.div>

      {/*
        The summary strip that sat here is gone. It counted finalised, in
        progress and not yet due — the same three piles the board's own filter
        chips count, in different words, one row above them. Two tallies of one
        set of documents is how a screen starts disagreeing with itself.
      */}

      {/* When the studio can act, the whole page is one unified board:
          one row per document, sending / receipts / signing / questions all
          on the row, in an inline drawer. The old release-panel + card-grid
          duplication is gone. */}
      {setProjectContext ? (
        <ClientDocumentBoard
          projectContext={projectContext}
          setProjectContext={setProjectContext}
          projectData={projectData}
          onNavigate={onNavigate}
          currentUserName={orgData?.orgName || 'Studio'}
          currentStage={currentStage}
          isExecutionGateOpen={isExecutionGateOpen}
          isDesigner={isDesigner}
          search={searchQuery}
          onSearch={setSearchQuery}
        />
      ) : (
      <>
      {/* Read-only fallback (client-facing preview): the plain document grid. */}
      <div className="space-y-8" ref={menuRef}>

        {(['Proposal', 'Agreement & Design', 'Execution'] as const).map((groupName) => {
          const docsInGroup = groupedDocs[groupName] || [];
          if (docsInGroup.length === 0) return null;

          return (
            <div key={groupName} className="space-y-3">
              {/* Group Title */}
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {groupName}
                </h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  {docsInGroup.length}
                </span>
              </div>

              {/* Group Document Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {docsInGroup.map((doc) => {
                  const Icon = doc.icon;
                  const token = doc.signable ? getSigningToken(projectContext, doc.signable.field) : undefined;
                  const isCopied = copiedDocId === doc.id;

                  return (
                    <div 
                      key={doc.id}
                      className={`relative flex flex-col justify-between p-5 rounded-[22px] border bg-white transition-all duration-300 group ${
                        doc.isAvailable 
                          ? 'hover:shadow-md hover:border-slate-300/80 border-[#EBEAE5]' 
                          : 'opacity-75 border-slate-100/70 bg-slate-50/40'
                      }`}
                    >
                      {/* Top Header Row of Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-4">
                          {/* Beautiful Custom-colored Icon Box */}
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${
                            doc.isGateLocked 
                              ? 'bg-red-50 text-red-500 border border-red-100' 
                              : !doc.isAvailable 
                                ? 'bg-slate-100 text-slate-400 border border-slate-200' 
                                : 'bg-sky-50/50 text-[#3D52A0] border border-sky-100/30'
                          }`}>
                            {doc.isGateLocked ? <Lock className="w-5 h-5" /> : <Icon className="w-5 h-5 stroke-[2]" />}
                          </div>

                          <div className="min-w-0">
                            {/* Badges and Name */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                Phase 0{doc.minStage}
                              </span>
                              {doc.signable && (
                                <span className="bg-sky-50 text-[#334486] text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border border-sky-100">
                                  E-Sign
                                </span>
                              )}
                              {doc.money && (
                                <span className="bg-amber-50 text-amber-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-100">
                                  Finance
                                </span>
                              )}
                            </div>

                            <h4 className="text-base font-extrabold text-slate-900 tracking-tight mt-1 leading-tight font-['Plus_Jakarta_Sans']">
                              {doc.name}
                            </h4>
                          </div>
                        </div>

                        {/* Status Label Pill */}
                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider whitespace-nowrap leading-none ${getToneClasses(doc.tone)}`}>
                          {doc.statusLabel}
                        </div>
                      </div>

                      {/* Detail Text & Divider */}
                      <div className="mt-4 pt-3 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <span className="text-xs text-slate-500 font-light truncate max-w-xs sm:max-w-md">
                          {doc.detail}
                        </span>

                        {/* Dropdown Action Trigger or Direct Access button */}
                        <div className="flex items-center gap-1.5 self-end sm:self-auto relative">
                          {doc.isAvailable ? (
                            <>
                              <button 
                                onClick={() => onNavigate(doc.id)}
                                className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100/80 text-[#334486] text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Open Document
                              </button>

                              {/* Dropdown Action Menu */}
                              <div className="relative">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === doc.id ? null : doc.id);
                                  }}
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                  title="Actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {/* Dropdown List with Absolute Positioning */}
                                {activeMenuId === doc.id && (
                                  <div className="absolute right-0 bottom-full sm:bottom-auto sm:top-full mb-2 sm:mb-0 sm:mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 text-left animate-in fade-in slide-in-from-top-2 duration-150">
                                    <button 
                                      onClick={() => {
                                        onNavigate(doc.id);
                                        setActiveMenuId(null);
                                      }}
                                      className="w-full px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer font-medium"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Open in workspace
                                    </button>

                                    {doc.signable && doc.tone !== 'signed' && (
                                      <button 
                                        onClick={() => {
                                          onNavigate(doc.id);
                                          setActiveMenuId(null);
                                        }}
                                        className="w-full px-3.5 py-2 text-xs text-[#334486] hover:bg-sky-50 transition-colors flex items-center gap-2 cursor-pointer font-bold"
                                      >
                                        <Send className="w-3.5 h-3.5" />
                                        Send for signature
                                      </button>
                                    )}

                                    {doc.signable && token && (
                                      <button 
                                        onClick={() => handleCopySigningLink(doc.id, token)}
                                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer font-medium"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy signing link
                                      </button>
                                    )}

                                    {doc.downloadable && (
                                      <button 
                                        onClick={() => {
                                          onNavigate(doc.id);
                                          setActiveMenuId(null);
                                        }}
                                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer font-medium"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        Download PDF
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none bg-slate-100 px-2 py-1 rounded-md">
                              <Lock className="w-3 h-3 shrink-0" /> {doc.isGateLocked ? 'Gate Locked' : 'Stage Locked'}
                            </div>
                          )}

                          {/* Signing Link Copied Inline Tooltip */}
                          {isCopied && (
                            <span className="absolute -top-10 right-0 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-md animate-bounce">
                              Link Copied ✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      </>
      )}

      {/* HELP FOOTER ACCENT */}
      <div className="bg-amber-50/50 border border-amber-100 rounded-[20px] p-5 flex items-start gap-3.5 mt-8 no-print">
        <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed font-light">
          <strong className="font-bold">Pro-tip:</strong> To issue or execute agreements, send files for signature, or download clean print-ready PDFs, open the document directly. Changes made inside their workspace tabs synchronize with the Documents Vault immediately.
        </div>
      </div>
    </div>
  );
}
