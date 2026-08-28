import React, { useState, useMemo, useEffect } from "react";
import {
  ShieldAlert,
  Unlock,
  CheckCircle2,
  Lock,
  ArrowRight,
  AlertTriangle,
  PlayCircle,
  FileCheck2,
  Wallet,
  HardHat,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  Sliders,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Sparkles,
  RefreshCw,
  Zap,
  Layers,
  PackageCheck,
  Clock,
  Activity,
  Filter,
  Calendar,
  Building2,
  CheckSquare,
  Square,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import WavyText from "./ui/WavyText";
import RoomProgressTracker from "./ops/RoomProgressTracker";
import { useOrg } from "../contexts/OrgContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebaseClient";
import { formatINR } from "../lib/utils";
import { analyzeExecutionPackageRisks, ExecutionPackageRiskAnalysis } from "../services/geminiService";

export interface Gatekeepers {
  sof: boolean;
  gfc: boolean;
  payment: boolean;
  site: boolean;
}

export interface OverrideAudit {
  by: string;
  at: number;
  reason: string;
}

export interface ExecutionBundle {
  id: string;
  code: string;
  name: string;
  trade: string;
  status: "pending" | "active" | "blocked" | "completed";
  isOverridden: boolean;
  gatekeepers: Gatekeepers;
  actToday: string;
  breaksTomorrow: string;
  totalValue: number;
  overrideAudit: OverrideAudit | null;
  itemIds: string[];
}

const BUNDLE_CATEGORY_MAP: Record<string, string> = {
  "EB-01": "general",
  "EB-02": "civil",
  "EB-03": "plumbing",
  "EB-04": "flooring",
  "EB-05": "tiling",
  "EB-06": "carpentry",
  "EB-07": "kitchen",
  "EB-08": "ceiling",
  "EB-10": "woodwork",
  "EB-11": "electrical",
};

const BUNDLE_DRAWING_INDEX: Record<string, string[]> = {
  general: ["general_layout", "demolition_plan"],
  civil: ["demolition_plan", "civil_layout"],
  plumbing: ["plumbing_layout", "plumbing_schematic"],
  flooring: ["flooring_layout"],
  tiling: ["flooring_layout", "bathroom_details"],
  ceiling: ["ceiling_layout", "lighting_layout"],
  electrical: ["electrical_layout", "lighting_layout", "power_layout"],
  carpentry: ["carpentry_detail", "elevation"],
  woodwork: ["carpentry_detail", "elevation"],
  kitchen: ["kitchen_layout", "kitchen_elevation"],
};

export const generateBundlesFromBoq = (boq: any[]): ExecutionBundle[] => {
  if (!boq || boq.length === 0) return [];

  const groups: Record<string, any[]> = {};
  boq.forEach((item) => {
    const cat = item.cat || item.category || "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const getSortWeight = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower.includes("site") || lower.includes("services") || lower.includes("preliminaries") || lower.includes("general")) return 0;
    if (lower.includes("civil") || lower.includes("demolition")) return 1;
    if (lower.includes("plumbing")) return 2;
    if (lower.includes("electrical") || lower.includes("wiring") || lower.includes("hvac") || lower.includes("ac")) return 3;
    if (lower.includes("ceiling") || lower.includes("false ceiling")) return 4;
    if (lower.includes("flooring") || lower.includes("tiling") || lower.includes("stone") || lower.includes("marble")) return 5;
    if (lower.includes("carpentry") || lower.includes("woodwork") || lower.includes("modular") || lower.includes("kitchen")) return 6;
    if (lower.includes("painting") || lower.includes("finishing") || lower.includes("polish")) return 7;
    return 8;
  };

  const sortedCats = Object.keys(groups).sort((a, b) => {
    const diff = getSortWeight(a) - getSortWeight(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  return sortedCats.map((cat, idx) => {
    const items = groups[cat];
    const totalValue = items.reduce(
      (sum, i) => sum + (i.total || i.rate * i.qty || 0),
      0
    );
    const code = `EB-${String(idx + 1).padStart(2, "0")}`;

    return {
      id: `bundle_${idx}_${code}`,
      code,
      name: `${cat} Execution Package`,
      trade: cat,
      status: "blocked",
      isOverridden: false,
      gatekeepers: { sof: false, gfc: false, payment: false, site: false },
      actToday: `Assess site readiness and freeze SOF for ${cat}.`,
      breaksTomorrow: `Delay impacts standard sequential execution.`,
      totalValue,
      itemIds: items.map((i) => i.id || i.tempId).filter(Boolean),
      overrideAudit: null,
    };
  });
};

const ExecutionWorkspace = ({
  projectContext,
  setProjectContext,
  projectId,
  executionData,
  decisionBrainOutput,
  boq = [],
  onUpdateExecutionData,
  onNavigateDrawings,
}: any) => {
  const { currentUserAuth, currentRole, orgData, teamMembers } = useOrg();
  const isDesigner = currentRole === "Designer";

  // Navigation sub-views to declutter the page
  const [activeSubView, setActiveSubView] = useState<"packages" | "room-progress" | "controls">("packages");
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ready" | "blocked" | "completed" | "overridden">("all");
  const [selectedTrade, setSelectedTrade] = useState<string>("all");
  const [expandedBundleIds, setExpandedBundleIds] = useState<Set<string>>(new Set());

  // Firestore Drawings
  const [allDrawings, setAllDrawings] = useState<any[]>([]);

  // Override & Edit Modals
  const [overrideModalBundleId, setOverrideModalBundleId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ExecutionBundle>>({});

  // AI Risk Analysis State
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiRiskReport, setAiRiskReport] = useState<ExecutionPackageRiskAnalysis | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // Auto-Unblock Toast/Feedback
  const [autoUnblockBanner, setAutoUnblockBanner] = useState<string | null>(null);

  const siteSupervisors = useMemo(() => {
    return teamMembers ? teamMembers.filter((m: any) => m.role === 'Site Supervisor') : [];
  }, [teamMembers]);

  const handleContextChange = (field: string, value: any) => {
    if (setProjectContext) {
      setProjectContext((prev: any) => ({ ...prev, [field]: value }));
    }
  };

  const orgId = orgData?.id;

  // Listen to GFCs
  useEffect(() => {
    if (!projectId || !orgId) return;
    try {
      const unsub = onSnapshot(
        collection(db, `organizations/${orgId}/projects/${projectId}/drawingTracker`),
        (snap) => {
          const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setAllDrawings(list);
        },
        (err) => {
          console.error("Failed to fetch drawing tracker", err);
        }
      );
      return () => unsub();
    } catch (e) {
      console.warn("Firestore not available for drawing tracker", e);
    }
  }, [projectId, orgId]);

  // Derive initial bundles if missing
  const fallbackBundles = useMemo(() => generateBundlesFromBoq(boq || []), [boq]);
  let currentBundles: ExecutionBundle[] =
    executionData?.bundles && executionData.bundles.length > 0
      ? executionData.bundles
      : fallbackBundles;

  // Compute unblocking logic based on real drawings, SOF, and payment milestones
  const computedBundles = useMemo(() => {
    return currentBundles.map((b) => {
      // 1. Determine GFC status based on drawings
      let mappedCat = BUNDLE_CATEGORY_MAP[b.code];
      if (!mappedCat && b.trade) {
        mappedCat = Object.keys(BUNDLE_DRAWING_INDEX).find((k) =>
          b.trade.toLowerCase().includes(k)
        ) || b.trade.toLowerCase();
      }

      let gfcCleared = false;
      if (mappedCat && BUNDLE_DRAWING_INDEX[mappedCat]) {
        const config = BUNDLE_DRAWING_INDEX[mappedCat];
        const matched = allDrawings.filter((d) => {
          if (mappedCat === "woodwork" || mappedCat === "carpentry") {
            return (
              d.id.startsWith("elevation_room_") ||
              d.id.startsWith("carpentry_detail_room_") ||
              d.id.includes("elevation") ||
              d.id.includes("carpentry")
            );
          }
          return config.some((pattern) => d.id === pattern || d.id.startsWith(pattern) || d.id.includes(pattern));
        });

        const missingDrawings = matched.filter((d) => !d.gfc || d.gfc.status !== "issued");
        gfcCleared = matched.length > 0 && missingDrawings.length === 0;
      }

      // Auto-clear SOF if material selections are locked, ordered, or approved
      const materialSelections = projectContext?.materialSelections || [];
      const sofCleared = materialSelections.length > 0 && materialSelections.every((m: any) => m.status === 'locked' || m.status === 'ordered' || m.status === 'approved');

      // Auto-clear Commercial (payment) gatekeeper if there is any paid execution milestone
      const executionMilestones = (projectContext?.paymentMilestones || []).filter((m: any) => m.type === 'execution');
      const paymentCleared = executionMilestones.length > 0 && executionMilestones[0].status === 'paid';

      // Keep gatekeeper state
      const nextGatekeepers = { 
        ...b.gatekeepers, 
        gfc: gfcCleared || b.gatekeepers?.gfc,
        sof: sofCleared || b.gatekeepers?.sof,
        payment: paymentCleared || b.gatekeepers?.payment
      };

      // 2. Evaluate Final Status
      const allGatesCleared =
        nextGatekeepers.sof && nextGatekeepers.gfc && nextGatekeepers.payment && nextGatekeepers.site;

      let nextStatus = b.status;
      if (b.status !== "completed") {
        if (b.isOverridden) {
          nextStatus = "active";
        } else if (allGatesCleared) {
          nextStatus = b.status === "active" ? "active" : "pending";
        } else {
          nextStatus = "blocked";
        }
      }

      if (nextStatus === "active" && !b.isOverridden && !allGatesCleared) {
        nextStatus = "blocked";
      }

      return {
        ...b,
        gatekeepers: nextGatekeepers,
        status: nextStatus,
      };
    });
  }, [currentBundles, allDrawings, projectContext?.materialSelections, projectContext?.paymentMilestones]);

  // Sync computed state if it differs from current state
  useEffect(() => {
    if (!onUpdateExecutionData) return;
    const hasDiff = computedBundles.some((cB, i) => {
      const oB = currentBundles[i];
      if (!oB) return true;
      if (cB.status !== oB.status) return true;
      if (JSON.stringify(cB.gatekeepers) !== JSON.stringify(oB.gatekeepers)) return true;
      return false;
    });

    if (hasDiff) {
      onUpdateExecutionData({ ...executionData, bundles: computedBundles });
    }
  }, [computedBundles, currentBundles, executionData, onUpdateExecutionData]);

  const isProjectComplete = projectContext?.status === 'completed' || (projectContext as any)?.lifecycle?.stage === 'completed';

  const bundlesToRender = useMemo(() => {
    return isProjectComplete 
      ? computedBundles.map(b => ({ ...b, status: 'completed' as const }))
      : computedBundles;
  }, [computedBundles, isProjectComplete]);

  const updateBundles = (newBundles: ExecutionBundle[]) => {
    if (onUpdateExecutionData) {
      onUpdateExecutionData({ ...executionData, bundles: newBundles });
    }
  };

  // Map BOQ items to each bundle
  const bundleItemsMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    bundlesToRender.forEach(bundle => {
      const bTrade = (bundle.trade || '').toLowerCase();
      const items = boq.filter((item: any) => {
        const iId = item.id || item.tempId;
        if (bundle.itemIds && bundle.itemIds.includes(iId)) return true;
        const iCat = (item.cat || item.category || '').toLowerCase();
        if (iCat === bTrade) return true;
        if (bTrade.includes('carpentry') && (iCat.includes('wood') || iCat.includes('modular') || iCat.includes('wardrobe') || iCat.includes('kitchen'))) return true;
        if (bTrade.includes('electrical') && (iCat.includes('light') || iCat.includes('power') || iCat.includes('wiring'))) return true;
        if (bTrade.includes('civil') && (iCat.includes('masonry') || iCat.includes('demolition'))) return true;
        if (bTrade.includes('ceiling') && (iCat.includes('gypsum') || iCat.includes('pop'))) return true;
        if (bTrade.includes('flooring') && (iCat.includes('tile') || iCat.includes('granite') || iCat.includes('stone'))) return true;
        return false;
      });
      map[bundle.id] = items;
    });
    return map;
  }, [bundlesToRender, boq]);

  // Calculate item-level progress for a bundle
  const getBundleItemProgress = (bundleId: string) => {
    const items = bundleItemsMap[bundleId] || [];
    if (items.length === 0) return 0;
    const statuses = projectContext?.itemExecutionStatuses || {};
    let completed = 0;
    let inProgress = 0;
    items.forEach(item => {
      const id = item.id || item.tempId;
      const status = id ? statuses[id] : 'pending';
      if (status === 'completed') completed++;
      else if (status === 'in_progress') inProgress++;
    });
    return Math.round(((completed * 1.0 + inProgress * 0.5) / items.length) * 100);
  };

  // Handle individual item status change inside a bundle
  const handleItemStatusChange = (itemId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    if (!itemId) return;
    const nextItemStatuses = {
      ...(projectContext?.itemExecutionStatuses || {}),
      [itemId]: newStatus
    };

    // Also update weeklyRoomProgress if item is linked to a room
    const targetItem = boq.find((i: any) => (i.id || i.tempId) === itemId);
    let nextWeekly = { ...(projectContext?.weeklyRoomProgress || {}) };

    if (targetItem) {
      const roomKey = targetItem.roomId || targetItem.room || targetItem.roomName || '';
      if (roomKey) {
        const roomItems = boq.filter((i: any) => (i.roomId || i.room || i.roomName || '').toLowerCase() === roomKey.toLowerCase());
        let comp = 0;
        let inProg = 0;
        roomItems.forEach((i: any) => {
          const id = i.id || i.tempId;
          const st = id === itemId ? newStatus : (nextItemStatuses[id] || 'pending');
          if (st === 'completed') comp++;
          else if (st === 'in_progress') inProg++;
        });
        const calcProg = roomItems.length > 0 ? Math.round(((comp * 1.0 + inProg * 0.5) / roomItems.length) * 100) : 0;
        let calcStage = 'Carpentry & Assembly';
        if (calcProg === 100) calcStage = 'Handover Completed';
        else if (calcProg >= 80) calcStage = 'Painting & Finishes';
        else if (calcProg >= 50) calcStage = 'Carpentry & Assembly';
        else if (calcProg >= 30) calcStage = 'False Ceiling & Framing';
        else if (calcProg > 0) calcStage = 'Civil & MEP Layouts';

        const updatedRoomData = {
          Current: {
            progress: calcProg,
            stage: calcStage
          }
        };
        nextWeekly[roomKey] = updatedRoomData;
        if (targetItem.roomName) nextWeekly[targetItem.roomName] = updatedRoomData;
      }
    }

    if (setProjectContext) {
      setProjectContext((prev: any) => ({
        ...prev,
        itemExecutionStatuses: nextItemStatuses,
        weeklyRoomProgress: nextWeekly
      }));
    }
  };

  // Bulk update all items in a bundle
  const handleBulkUpdateBundleItems = (bundleId: string, status: 'pending' | 'in_progress' | 'completed') => {
    const items = bundleItemsMap[bundleId] || [];
    if (items.length === 0) return;

    const nextItemStatuses = { ...(projectContext?.itemExecutionStatuses || {}) };
    items.forEach(item => {
      const id = item.id || item.tempId;
      if (id) nextItemStatuses[id] = status;
    });

    if (setProjectContext) {
      setProjectContext((prev: any) => ({
        ...prev,
        itemExecutionStatuses: nextItemStatuses
      }));
    }
  };

  // Smart Auto-Unblock Action
  const handleSmartAutoUnblock = () => {
    let unblockedCount = 0;
    const next = bundlesToRender.map(b => {
      const allGatesCleared = b.gatekeepers.sof && b.gatekeepers.gfc && b.gatekeepers.payment && b.gatekeepers.site;
      if (allGatesCleared && b.status === "blocked") {
        unblockedCount++;
        return { ...b, status: "pending" as const };
      }
      return b;
    });

    updateBundles(next);
    setAutoUnblockBanner(`Smart scan completed: ${unblockedCount > 0 ? `${unblockedCount} packages cleared and moved to Ready to Start.` : 'All gated packages currently require pending approvals.'}`);
    setTimeout(() => setAutoUnblockBanner(null), 4500);
  };

  // Trigger AI Risk Analysis
  const handleRunAiRiskScan = async () => {
    setIsAiAnalyzing(true);
    setShowAiModal(true);
    try {
      const report = await analyzeExecutionPackageRisks(bundlesToRender, boq, projectContext, allDrawings);
      setAiRiskReport(report);
    } catch (e) {
      console.error("AI risk analysis failed", e);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Toggle Gate
  const handleToggleGate = (bundleId: string, gate: keyof Gatekeepers) => {
    const next = bundlesToRender.map((b) => {
      if (b.id === bundleId) {
        return {
          ...b,
          gatekeepers: {
            ...b.gatekeepers,
            [gate]: !b.gatekeepers[gate],
          },
        };
      }
      return b;
    });
    updateBundles(next);
  };

  // Proceed At Risk Override
  const handleProceedAtRisk = (bundleId: string, reason: string) => {
    if (!reason.trim()) {
      alert("Please provide an override justification reason.");
      return;
    }

    const next = bundlesToRender.map((b) => {
      if (b.id === bundleId) {
        return {
          ...b,
          isOverridden: true,
          status: "active" as const,
          overrideAudit: {
            by: currentUserAuth?.email || "Ops Lead",
            at: Date.now(),
            reason: reason.trim(),
          },
        };
      }
      return b;
    });

    updateBundles(next);
    setOverrideModalBundleId(null);
    setOverrideReason("");
  };

  const handleRemoveOverride = (bundleId: string) => {
    const next = bundlesToRender.map((b) => {
      if (b.id === bundleId) {
        return {
          ...b,
          isOverridden: false,
          overrideAudit: null,
        };
      }
      return b;
    });
    updateBundles(next);
  };

  // Add Custom Bundle
  const handleAddBundle = () => {
    const newId = `bundle_custom_${Date.now()}`;
    const newBundle: ExecutionBundle = {
      id: newId,
      code: `EB-${String(bundlesToRender.length + 1).padStart(2, "0")}`,
      name: `Custom Execution Package`,
      trade: "General",
      status: "blocked",
      isOverridden: false,
      gatekeepers: { sof: false, gfc: false, payment: false, site: false },
      actToday: "Review scope specifications and allocate trade manpower.",
      breaksTomorrow: "Delay impacts turnkey project completion.",
      totalValue: 0,
      itemIds: [],
      overrideAudit: null,
    };
    updateBundles([...bundlesToRender, newBundle]);
    setEditingBundleId(newId);
    setEditForm(newBundle);
  };

  const handleDeleteBundle = (bundleId: string) => {
    const next = bundlesToRender.filter((b) => b.id !== bundleId);
    updateBundles(next);
    if (editingBundleId === bundleId) setEditingBundleId(null);
  };

  const handleSaveBundle = (bundleId: string) => {
    const next = bundlesToRender.map((b) => {
      if (b.id === bundleId) {
        return { ...b, ...editForm };
      }
      return b;
    });
    updateBundles(next);
    setEditingBundleId(null);
  };

  // Sync / Re-derive from BOQ
  const handleResyncWithBoq = () => {
    const fresh = generateBundlesFromBoq(boq);
    updateBundles(fresh);
    setAutoUnblockBanner(`Synced ${fresh.length} execution packages with the active BOQ deliverables.`);
    setTimeout(() => setAutoUnblockBanner(null), 3500);
  };

  // Toggle accordion expand
  const toggleBundleExpand = (id: string) => {
    setExpandedBundleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Statistics
  const activeCount = bundlesToRender.filter((b) => b.status === "active").length;
  const blockedCount = bundlesToRender.filter((b) => b.status === "blocked").length;
  const readyCount = bundlesToRender.filter((b) => b.status === "pending" || (b.status === "blocked" && b.gatekeepers.sof && b.gatekeepers.gfc && b.gatekeepers.payment && b.gatekeepers.site)).length;
  const completedCount = bundlesToRender.filter((b) => b.status === "completed").length;
  const totalCount = bundlesToRender.length;
  const totalScopeValue = bundlesToRender.reduce((sum, b) => sum + (b.totalValue || 0), 0);
  const totalDeliverablesCount = boq.length;

  // Gate Bottlenecks
  const sofBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.sof).length;
  const gfcBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.gfc).length;
  const paymentBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.payment).length;
  const siteBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.site).length;

  // Overall Item-level completion
  const overallItemProgress = useMemo(() => {
    if (boq.length === 0) return 0;
    const statuses = projectContext?.itemExecutionStatuses || {};
    let comp = 0;
    let inP = 0;
    boq.forEach((item: any) => {
      const id = item.id || item.tempId;
      const st = id ? statuses[id] : 'pending';
      if (st === 'completed') comp++;
      else if (st === 'in_progress') inP++;
    });
    return Math.round(((comp * 1.0 + inP * 0.5) / boq.length) * 100);
  }, [boq, projectContext?.itemExecutionStatuses]);

  // Unique trades for filtering
  const allTrades = useMemo(() => {
    return Array.from(new Set(bundlesToRender.map(b => b.trade || 'General'))).filter(Boolean);
  }, [bundlesToRender]);

  // Filtered bundles list
  const filteredBundles = useMemo(() => {
    return bundlesToRender.filter(bundle => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesBundle = bundle.name.toLowerCase().includes(q) || bundle.code.toLowerCase().includes(q) || bundle.trade.toLowerCase().includes(q);
        const linkedItems = bundleItemsMap[bundle.id] || [];
        const matchesItem = linkedItems.some(i => (i.name || '').toLowerCase().includes(q) || (i.specs || '').toLowerCase().includes(q) || (i.roomId || i.room || '').toLowerCase().includes(q));
        if (!matchesBundle && !matchesItem) return false;
      }

      // Trade filter
      if (selectedTrade !== "all" && bundle.trade !== selectedTrade) {
        return false;
      }

      // Status filter
      if (statusFilter === "active" && bundle.status !== "active") return false;
      if (statusFilter === "blocked" && bundle.status !== "blocked") return false;
      if (statusFilter === "completed" && bundle.status !== "completed") return false;
      if (statusFilter === "overridden" && !bundle.isOverridden) return false;
      if (statusFilter === "ready") {
        const isReady = bundle.status === "pending" || (bAllClear(bundle) && bundle.status !== "completed");
        if (!isReady) return false;
      }

      return true;
    });
  }, [bundlesToRender, searchQuery, selectedTrade, statusFilter, bundleItemsMap]);

  function bAllClear(b: ExecutionBundle) {
    return b.gatekeepers.sof && b.gatekeepers.gfc && b.gatekeepers.payment && b.gatekeepers.site;
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP EXECUTIVE COMMAND BAR */}
      <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs p-6 sm:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 border border-sky-200/60 text-[#0066CC] rounded-full text-xs font-bold uppercase tracking-wider">
                <HardHat className="w-3.5 h-3.5" />
                Site Control Room
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                isProjectComplete
                  ? 'bg-emerald-100 text-emerald-800'
                  : blockedCount > 0
                  ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
              }`}>
                {isProjectComplete ? 'Project Handed Over' : blockedCount > 0 ? `${blockedCount} Pending Checks` : 'All Packages Ready'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Trade Packages & Site Readiness
            </h2>
            <div className="mt-0.5">
              <WavyText
                text="Track trade packages, gatekeeper checks, and site execution status."
                className="text-xs sm:text-sm font-medium text-slate-500 max-w-xl leading-relaxed"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleSmartAutoUnblock}
              title="Auto-evaluate real GFC drawings and SOF selections to unblock ready packages"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              Smart Auto-Unblock
            </button>

            <button
              onClick={handleRunAiRiskScan}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              AI Risk Scan
            </button>

            <button
              onClick={handleResyncWithBoq}
              title="Re-sync package scopes with latest BOQ"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              Re-sync BOQ
            </button>

            <button
              onClick={handleAddBundle}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Package
            </button>
          </div>
        </div>

        {/* Auto Unblock Notification Banner */}
        <AnimatePresence>
          {autoUnblockBanner && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800 font-semibold"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{autoUnblockBanner}</span>
              </div>
              <button onClick={() => setAutoUnblockBanner(null)} className="text-emerald-600 hover:text-emerald-900 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* High-Level Pulse Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Packages</div>
            <div className="text-xl font-black text-slate-900 mt-1">{totalCount}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">{totalDeliverablesCount} BOQ items</div>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active Execution</div>
            <div className="text-xl font-black text-emerald-700 mt-1">{activeCount}</div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">On-site in progress</div>
          </div>

          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Ready to Start</div>
            <div className="text-xl font-black text-amber-700 mt-1">{readyCount}</div>
            <div className="text-[10px] text-amber-600 font-medium mt-0.5">All 4 gates cleared</div>
          </div>

          <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Gated / Blocked</div>
            <div className="text-xl font-black text-rose-700 mt-1">{blockedCount}</div>
            <div className="text-[10px] text-rose-600 font-medium mt-0.5">{gfcBlocked} GFC · {sofBlocked} SOF</div>
          </div>

          <div className="bg-sky-50/50 border border-sky-100 rounded-2xl p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0066CC]">Completed</div>
            <div className="text-xl font-black text-[#0066CC] mt-1">{completedCount}</div>
            <div className="text-[10px] text-[#0066CC]/70 font-medium mt-0.5">Signed off packages</div>
          </div>

          <div className="bg-[#0066CC] text-white rounded-2xl p-3.5 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-100">Total Deliverables QA</div>
            <div className="text-xl font-black text-white mt-1">{overallItemProgress}%</div>
            <div className="text-[10px] text-sky-100 font-medium mt-0.5">
              {!isDesigner && totalScopeValue > 0 ? formatINR(totalScopeValue) : 'Itemized QA'}
            </div>
          </div>
        </div>

        {/* 2. DECLUTTERED VIEW SELECTOR TABS */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => setActiveSubView("packages")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeSubView === "packages"
                  ? "bg-white text-[#0066CC] shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              Packages & BOQ Deliverables ({filteredBundles.length})
            </button>

            <button
              onClick={() => setActiveSubView("room-progress")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeSubView === "room-progress"
                  ? "bg-white text-[#0066CC] shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Room Progress Sync (Client Portal)
            </button>

            <button
              onClick={() => setActiveSubView("controls")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeSubView === "controls"
                  ? "bg-white text-[#0066CC] shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sliders className="w-4 h-4" />
              Site Dates & Supervisor Controls
            </button>
          </div>

          {/* Quick Gating Summary Pill */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 font-semibold">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${gfcBlocked > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              GFC: {gfcBlocked === 0 ? 'All Issued' : `${gfcBlocked} Pending`}
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${sofBlocked > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              SOF: {sofBlocked === 0 ? 'All Locked' : `${sofBlocked} Pending`}
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${paymentBlocked > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              Comm: {paymentBlocked === 0 ? 'Cleared' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* VIEW 1: PACKAGES & BOQ DELIVERABLES */}
      {activeSubView === "packages" && (
        <div className="space-y-4">
          {/* Search, Filter & Trade Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search packages, trades, or BOQ deliverables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066CC] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-[#0066CC] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({bundlesToRender.length})
              </button>

              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                Active ({activeCount})
              </button>

              <button
                onClick={() => setStatusFilter("ready")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "ready"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
              >
                Ready ({readyCount})
              </button>

              <button
                onClick={() => setStatusFilter("blocked")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "blocked"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-800 hover:bg-rose-100"
                }`}
              >
                Blocked ({blockedCount})
              </button>

              <button
                onClick={() => setStatusFilter("completed")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "completed"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>

          {/* Trade Filter Chips */}
          {allTrades.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] shrink-0">Filter Trade:</span>
              <button
                onClick={() => setSelectedTrade("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  selectedTrade === "all" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                All Trades
              </button>
              {allTrades.map(trade => (
                <button
                  key={trade}
                  onClick={() => setSelectedTrade(trade)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 transition-colors ${
                    selectedTrade === trade ? "bg-[#0066CC] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {trade}
                </button>
              ))}
            </div>
          )}

          {/* Packages List */}
          {filteredBundles.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <HardHat className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No execution packages match your filter</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try adjusting your search keywords or status filters, or click "Re-sync BOQ" to generate packages from proposal items.
              </p>
              <button
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); setSelectedTrade("all"); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBundles.map((bundle) => {
                const isExpanded = expandedBundleIds.has(bundle.id);
                const items = bundleItemsMap[bundle.id] || [];
                const itemProgress = getBundleItemProgress(bundle.id);
                const allClear = bAllClear(bundle);

                if (editingBundleId === bundle.id) {
                  return (
                    <div key={bundle.id} className="bg-white rounded-2xl border border-sky-200 ring-4 ring-sky-50 shadow-sm p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-bold text-slate-900">Edit Execution Package</h3>
                        <button
                          onClick={() => setEditingBundleId(null)}
                          className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Package Code</label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-[#0066CC]"
                            value={editForm.code || ""}
                            onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Package Name</label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-[#0066CC]"
                            value={editForm.name || ""}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ops Act Today</label>
                          <textarea
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0066CC] h-20 resize-none"
                            value={editForm.actToday || ""}
                            onChange={(e) => setEditForm({ ...editForm, actToday: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Breaks Tomorrow</label>
                          <textarea
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#0066CC] h-20 resize-none"
                            value={editForm.breaksTomorrow || ""}
                            onChange={(e) => setEditForm({ ...editForm, breaksTomorrow: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                        <button
                          onClick={() => handleDeleteBundle(bundle.id)}
                          className="flex items-center gap-1.5 px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold uppercase"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Package
                        </button>
                        <button
                          onClick={() => handleSaveBundle(bundle.id)}
                          className="flex items-center gap-1.5 px-6 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white rounded-xl text-xs font-bold uppercase shadow-sm"
                        >
                          <Save className="w-4 h-4" /> Save Package
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={bundle.id}
                    className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden group ${
                      bundle.status === "completed"
                        ? "border-emerald-200 bg-emerald-50/20"
                        : bundle.isOverridden
                        ? "border-amber-300 ring-2 ring-amber-100"
                        : bundle.status === "active"
                        ? "border-emerald-300 ring-2 ring-emerald-100"
                        : bundle.status === "blocked"
                        ? "border-rose-200"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Header Row */}
                    <div className="p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-slate-200">
                            {bundle.code}
                          </span>
                          <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2 truncate">
                            {bundle.name}
                            <button
                              onClick={() => { setEditingBundleId(bundle.id); setEditForm(bundle); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-[#0066CC] rounded transition-opacity"
                              title="Edit Package"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </h3>

                          <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full border ${
                            bundle.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : bundle.status === "completed"
                              ? "bg-sky-50 text-[#0066CC] border-sky-200"
                              : bundle.status === "blocked"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {bundle.status === 'active' ? 'Active On-Site' : bundle.status === 'completed' ? 'Completed' : bundle.status === 'blocked' ? 'Gated (Blocked)' : 'Ready to Start'}
                          </span>

                          {bundle.isOverridden && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold uppercase rounded-md border border-amber-200 flex items-center gap-1">
                              <Unlock className="w-3 h-3 text-amber-700" /> At-Risk Override
                            </span>
                          )}
                        </div>

                        {/* 4 Gatekeeper Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <GateBadge
                            label="SOF Freeze"
                            active={bundle.gatekeepers.sof}
                            onClick={() => handleToggleGate(bundle.id, "sof")}
                            icon={<FileCheck2 className="w-3.5 h-3.5" />}
                          />
                          <GateBadge
                            label="GFC Issued"
                            active={bundle.gatekeepers.gfc}
                            onClick={() => handleToggleGate(bundle.id, "gfc")}
                            icon={<FileCheck2 className="w-3.5 h-3.5" />}
                          />
                          <GateBadge
                            label="Commercial"
                            active={bundle.gatekeepers.payment}
                            onClick={() => handleToggleGate(bundle.id, "payment")}
                            icon={<Wallet className="w-3.5 h-3.5" />}
                          />
                          <GateBadge
                            label="Site Ready"
                            active={bundle.gatekeepers.site}
                            onClick={() => handleToggleGate(bundle.id, "site")}
                            icon={<HardHat className="w-3.5 h-3.5" />}
                          />
                        </div>

                        {/* Linked Deliverables & Progress summary strip */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                            <PackageCheck className="w-3.5 h-3.5 text-[#0066CC]" />
                            {items.length} BOQ Deliverables
                          </span>

                          {!isDesigner && bundle.totalValue > 0 && (
                            <span className="font-bold text-slate-900">
                              Package Value: {formatINR(bundle.totalValue)}
                            </span>
                          )}

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">Deliverables QA:</span>
                            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  itemProgress === 100 ? 'bg-emerald-500' : itemProgress > 50 ? 'bg-[#0066CC]' : 'bg-amber-400'
                                }`}
                                style={{ width: `${itemProgress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-800">{itemProgress}%</span>
                          </div>

                          <button
                            onClick={() => toggleBundleExpand(bundle.id)}
                            className="text-xs font-bold text-[#0066CC] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? 'Hide Deliverables' : `View ${items.length} Items`}
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Package Actions */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-2 shrink-0 w-full lg:w-auto">
                        {bundle.status === "completed" ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="flex items-center gap-1.5 px-4 py-2 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-xl">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Execution Completed
                            </span>
                            {!isProjectComplete && (
                              <button
                                onClick={() => {
                                  const next = bundlesToRender.map(b => b.id === bundle.id ? { ...b, status: b.isOverridden ? 'active' : (allClear ? 'pending' : 'blocked') } : b);
                                  updateBundles(next);
                                }}
                                className="text-[10px] text-slate-400 hover:text-slate-700 uppercase font-bold"
                              >
                                Reopen Package
                              </button>
                            )}
                          </div>
                        ) : bundle.isOverridden ? (
                          <div className="flex flex-col gap-2 w-full sm:w-auto">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRemoveOverride(bundle.id)}
                                className="text-[11px] font-bold text-amber-800 hover:text-amber-900 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Lock className="w-3 h-3" /> Re-engage Gates
                              </button>
                              <button
                                onClick={() => {
                                  const next = bundlesToRender.map(b => b.id === bundle.id ? { ...b, status: 'completed' as const } : b);
                                  updateBundles(next);
                                }}
                                className="text-[11px] font-bold text-emerald-800 hover:text-emerald-900 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Complete
                              </button>
                            </div>
                          </div>
                        ) : !allClear ? (
                          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                            <button
                              onClick={() => setOverrideModalBundleId(bundle.id)}
                              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-rose-200 cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Proceed At Risk
                            </button>
                          </div>
                        ) : bundle.status === "active" ? (
                          <button
                            onClick={() => {
                              const next = bundlesToRender.map(b => b.id === bundle.id ? { ...b, status: 'completed' as const } : b);
                              updateBundles(next);
                            }}
                            className="flex items-center justify-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Completed
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const next = bundlesToRender.map(b => b.id === bundle.id ? { ...b, status: 'active' as const } : b);
                              updateBundles(next);
                            }}
                            className="flex items-center justify-center gap-1.5 px-5 py-2 bg-[#0066CC] hover:bg-[#0052A3] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                          >
                            <PlayCircle className="w-4 h-4" />
                            Start Execution
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable BOQ Deliverables Accordion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-slate-100 bg-slate-50/70 p-5 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                <PackageCheck className="w-4 h-4 text-[#0066CC]" />
                                Linked BOQ Deliverables ({items.length})
                              </h4>
                              <p className="text-[11px] text-slate-500">
                                Toggle item execution statuses to automatically update room progress and synchronize with the client portal.
                              </p>
                            </div>

                            {/* Bulk Actions */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleBulkUpdateBundleItems(bundle.id, 'in_progress')}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Mark All In-Progress
                              </button>
                              <button
                                onClick={() => handleBulkUpdateBundleItems(bundle.id, 'completed')}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Mark All Done
                              </button>
                            </div>
                          </div>

                          {items.length === 0 ? (
                            <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                              No deliverables currently tied to this package. Click "Re-sync BOQ" or edit items.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {items.map((item: any, iIdx: number) => {
                                const itemId = item.id || item.tempId || `item-${iIdx}`;
                                const currentItemStatus = (projectContext?.itemExecutionStatuses || {})[itemId] || 'pending';
                                const roomName = item.roomName || item.room || item.roomId || 'General Scope';

                                return (
                                  <div
                                    key={itemId}
                                    className={`p-3.5 rounded-xl border transition-all ${
                                      currentItemStatus === 'completed'
                                        ? 'bg-emerald-50/50 border-emerald-200'
                                        : currentItemStatus === 'in_progress'
                                        ? 'bg-amber-50/50 border-amber-200'
                                        : 'bg-white border-slate-200/80'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded uppercase">
                                            {roomName}
                                          </span>
                                          <span className="text-xs font-extrabold text-slate-900 truncate block">
                                            {item.name}
                                          </span>
                                        </div>
                                        {item.specs && (
                                          <p className="text-[11px] text-slate-500 line-clamp-1">
                                            {item.specs}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-semibold pt-0.5">
                                          <span>Qty: {item.qty} {item.unit}</span>
                                          {!isDesigner && item.total && (
                                            <span>Value: {formatINR(item.total)}</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Status Selector */}
                                      <div className="shrink-0 flex items-center gap-1">
                                        <button
                                          onClick={() => handleItemStatusChange(itemId, currentItemStatus === 'completed' ? 'pending' : currentItemStatus === 'in_progress' ? 'completed' : 'in_progress')}
                                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                                            currentItemStatus === 'completed'
                                              ? 'bg-emerald-600 text-white shadow-2xs'
                                              : currentItemStatus === 'in_progress'
                                              ? 'bg-amber-500 text-white shadow-2xs'
                                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                          }`}
                                        >
                                          {currentItemStatus === 'completed' ? 'Done' : currentItemStatus === 'in_progress' ? 'In Progress' : 'Pending'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Operational Intel Footer */}
                    <div className="bg-slate-50 border-t border-slate-100 px-5 py-3.5 flex flex-col sm:flex-row gap-4 text-xs">
                      <div className="flex-1 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#0066CC] shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-[#0066CC] uppercase text-[10px] tracking-wider block">Ops Act Today:</span>
                          <p className="text-slate-700 font-medium text-[11px] leading-relaxed">
                            {bundle.actToday || `Clear pending gates for ${bundle.name} to unblock execution.`}
                          </p>
                        </div>
                      </div>
                      <div className="flex-1 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-rose-600 uppercase text-[10px] tracking-wider block">Breaks Tomorrow:</span>
                          <p className="text-slate-700 font-medium text-[11px] leading-relaxed">
                            {bundle.breaksTomorrow || `Sequential delivery timeline will be impacted.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ROOM PROGRESS SYNC (CLIENT PORTAL) */}
      {activeSubView === "room-progress" && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg tracking-tight flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#0066CC]" />
                  Live Room Progress Matrix
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Synchronizes real-time progress percentages and active trade stages with the Client Portal.
                </p>
              </div>
            </div>

            <RoomProgressTracker
              projectContext={projectContext}
              setProjectContext={setProjectContext}
              boq={boq}
              bundles={bundlesToRender}
            />
          </div>
        </div>
      )}

      {/* VIEW 3: SITE CONTROLS & DATES */}
      {activeSubView === "controls" && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg tracking-tight flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[#0066CC]" />
                  Site Controls, Supervisors & Key Milestones
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Configure target handover dates, SOF freeze deadlines, and assign site supervisors.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Target Handover Date</label>
                <input
                  type="date"
                  value={projectContext?.targetHandoverDate || ''}
                  onChange={e => handleContextChange('targetHandoverDate', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-[#0066CC] outline-none transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">SOF Freeze Deadline</label>
                <input
                  type="date"
                  value={projectContext?.sofFreezeDate || ''}
                  onChange={e => handleContextChange('sofFreezeDate', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-[#0066CC] outline-none transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Procurement Lead Time</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    value={projectContext?.procurementLeadTimeWeeks || 4}
                    onChange={e => handleContextChange('procurementLeadTimeWeeks', Number(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-[#0066CC] outline-none transition-all pr-12 shadow-2xs"
                  />
                  <span className="absolute right-4 text-slate-400 text-xs font-bold">Wks</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Assigned Site Supervisor</label>
                <div className="relative">
                  <select
                    value={projectContext?.assignedSupervisors?.[0] || ''}
                    onChange={e => handleContextChange('assignedSupervisors', [e.target.value])}
                    className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-[#0066CC] outline-none appearance-none cursor-pointer pr-10 shadow-2xs"
                  >
                    <option value="">Unassigned (Reviewing...)</option>
                    {siteSupervisors.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none">
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Lifecycle Checkpoints */}
            <div className="pt-4 border-t border-slate-150 space-y-3">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Site Readiness Checkpoints</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleContextChange('briefFrozenAt', projectContext?.briefFrozenAt ? null : Date.now())}
                  className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer ${
                    projectContext?.briefFrozenAt
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Check className={`w-4 h-4 ${projectContext?.briefFrozenAt ? 'text-white' : 'text-slate-400'}`} />
                  <span>{projectContext?.briefFrozenAt ? 'Brief Locked' : 'Lock Design Brief'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleContextChange('designApprovedAt', projectContext?.designApprovedAt ? null : Date.now())}
                  className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer ${
                    projectContext?.designApprovedAt
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Check className={`w-4 h-4 ${projectContext?.designApprovedAt ? 'text-white' : 'text-slate-400'}`} />
                  <span>{projectContext?.designApprovedAt ? 'Design Cleared' : 'Approve Render GFC'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleContextChange('handoverDate', projectContext?.handoverDate ? null : Date.now())}
                  className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer ${
                    projectContext?.handoverDate
                      ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Check className={`w-4 h-4 ${projectContext?.handoverDate ? 'text-white' : 'text-slate-400'}`} />
                  <span>{projectContext?.handoverDate ? 'Handed Over' : 'Mark Handover'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI RISK SCAN REPORT MODAL */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowAiModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">AI Execution Gating & Sequencing Risk Scan</h3>
                    <p className="text-xs text-slate-500">Autonomous multi-trade gating analysis powered by Gemini</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAiModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {isAiAnalyzing ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Analyzing drawing clearances, SOF locks & trade sequences...</p>
                  </div>
                ) : aiRiskReport ? (
                  <div className="space-y-6">
                    {/* Overall Score */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Site Execution Health Score</span>
                        <p className="text-xs text-slate-600 mt-1 max-w-md">{aiRiskReport.summary}</p>
                      </div>
                      <div className="text-3xl font-black text-purple-700 px-4 py-2 bg-purple-100/60 rounded-2xl">
                        {aiRiskReport.healthScore}%
                      </div>
                    </div>

                    {/* Critical Bottlenecks */}
                    {aiRiskReport.criticalBottlenecks && aiRiskReport.criticalBottlenecks.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Critical Package Blockers ({aiRiskReport.criticalBottlenecks.length})
                        </h4>
                        <div className="space-y-2.5">
                          {aiRiskReport.criticalBottlenecks.map((bot, bIdx) => (
                            <div key={bIdx} className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-rose-900">{bot.bundleCode} · {bot.trade}</span>
                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                                  bot.severity === 'high' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                                }`}>
                                  {bot.severity} risk
                                </span>
                              </div>
                              <p className="text-slate-700">{bot.reason}</p>
                              <div className="text-[11px] text-emerald-800 font-semibold pt-1">
                                <strong>Action:</strong> {bot.recommendation}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sequencing Conflicts */}
                    {aiRiskReport.sequencingAlerts && aiRiskReport.sequencingAlerts.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Trade Sequencing Advisory
                        </h4>
                        <div className="space-y-2">
                          {aiRiskReport.sequencingAlerts.map((seq, sIdx) => (
                            <div key={sIdx} className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1">
                              <span className="font-extrabold text-amber-900 block">{seq.trade}</span>
                              <p className="text-slate-700">{seq.conflict}</p>
                              <p className="text-[11px] text-slate-500 font-medium"><strong>Supervisor Check:</strong> {seq.action}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowAiModal(false)}
                  className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase cursor-pointer"
                >
                  Close Advisory
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OVERRIDE MODAL */}
      <AnimatePresence>
        {overrideModalBundleId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setOverrideModalBundleId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Authorize Proceed at Risk
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  You are overriding standard execution gates. This package will be marked active on-site despite pending blockers. Please record your operational justification.
                </p>

                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Client approved SOF on WhatsApp, sample signed off on site..."
                  className="w-full h-24 p-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none resize-none mb-6"
                />

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setOverrideModalBundleId(null);
                      setOverrideReason("");
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleProceedAtRisk(overrideModalBundleId, overrideReason)}
                    disabled={!overrideReason.trim()}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50"
                  >
                    Authorize Override
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const GateBadge = ({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-[11px] font-bold cursor-pointer ${
        active
          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
      }`}
    >
      <div className={active ? "text-emerald-500" : "text-slate-400"}>
        {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : icon}
      </div>
      {label}
    </button>
  );
};

export default ExecutionWorkspace;
