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
  Save
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "../contexts/OrgContext";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebaseClient";

interface Gatekeepers {
  sof: boolean;
  gfc: boolean;
  payment: boolean;
  site: boolean;
}

interface OverrideAudit {
  by: string;
  at: number;
  reason: string;
}

interface ExecutionBundle {
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
  projectId,
  executionData,
  decisionBrainOutput,
  boq,
  onUpdateExecutionData,
  onNavigateDrawings,
}: any) => {
  const { currentUserAuth, orgData } = useOrg();
  const [allDrawings, setAllDrawings] = useState<any[]>([]);
  const [overrideModalBundleId, setOverrideModalBundleId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ExecutionBundle>>({});

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

  // Compute unblocking logic
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

      // If GFC is truly cleared by drawing tracker, automatically update the gatekeeper
      const nextGatekeepers = { ...b.gatekeepers, gfc: gfcCleared || b.gatekeepers?.gfc };

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

      // If they manually set to active but gates aren't clear, and it's NOT overridden, it gets blocked again.
      if (nextStatus === "active" && !b.isOverridden && !allGatesCleared) {
        nextStatus = "blocked";
      }

      return {
        ...b,
        gatekeepers: nextGatekeepers,
        status: nextStatus,
      };
    });
  }, [currentBundles, allDrawings]);

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

  // Render bundles from computed to ensure immediate UI feedback
  const isProjectComplete = projectContext?.status === 'completed' || (projectContext as any)?.lifecycle?.stage === 'completed';

  const bundlesToRender = isProjectComplete 
    ? computedBundles.map(b => ({ ...b, status: 'completed' as const }))
    : computedBundles;

  const updateBundles = (newBundles: ExecutionBundle[]) => {
    if (onUpdateExecutionData) {
      onUpdateExecutionData({ ...executionData, bundles: newBundles });
    }
  };

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
            by: currentUserAuth?.email || "Ops User",
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
          // Status will be re-evaluated by computedBundles on next render
        };
      }
      return b;
    });
    updateBundles(next);
  };

  const handleAddBundle = () => {
    const newId = `bundle_custom_${Date.now()}`;
    const newBundle: ExecutionBundle = {
      id: newId,
      code: `EB-CUSTOM`,
      name: `New Custom Bundle`,
      trade: "custom",
      status: "blocked",
      isOverridden: false,
      gatekeepers: { sof: false, gfc: false, payment: false, site: false },
      actToday: "",
      breaksTomorrow: "",
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

  const activeCount = bundlesToRender.filter((b) => b.status === "active").length;
  const blockedCount = bundlesToRender.filter((b) => b.status === "blocked").length;
  const completedCount = bundlesToRender.filter((b) => b.status === "completed").length;
  const totalCount = bundlesToRender.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Bottleneck analysis
  const sofBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.sof).length;
  const gfcBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.gfc).length;
  const commercialBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.payment).length;
  const siteBlocked = bundlesToRender.filter(b => b.status === 'blocked' && !b.gatekeepers.site).length;

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-8 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-100/50 rounded-bl-full -z-10 blur-3xl opacity-50"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
              <h2 className="text-2xl font-bold tracking-tight text-indigo-950">Execution Intelligence</h2>
              <button
                onClick={handleAddBundle}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Bundle
              </button>
            </div>
            <p className="text-indigo-950/60 max-w-xl text-sm leading-relaxed mb-6">
              Execution bundles are the atomic units of progress. Clear all gates (SOF, GFC, Commercial, Site) to unblock a bundle. Use Ops Overrides only when absolutely necessary to prevent stalling.
            </p>
            
            {totalCount > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-indigo-100 shadow-sm">
                   <div>
                       <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/50 mb-1">SOF Bottleneck</div>
                       <div className="text-lg font-semibold text-amber-500">{sofBlocked} <span className="text-sm text-indigo-900/40 font-normal">blocked</span></div>
                   </div>
                   <div>
                       <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/50 mb-1">GFC Bottleneck</div>
                       <div className="text-lg font-semibold text-rose-500">{gfcBlocked} <span className="text-sm text-indigo-900/40 font-normal">blocked</span></div>
                   </div>
                   <div>
                       <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/50 mb-1">Comm Bottleneck</div>
                       <div className="text-lg font-semibold text-indigo-500">{commercialBlocked} <span className="text-sm text-indigo-900/40 font-normal">blocked</span></div>
                   </div>
                   <div>
                       <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/50 mb-1">Site Bottleneck</div>
                       <div className="text-lg font-semibold text-emerald-500">{siteBlocked} <span className="text-sm text-indigo-900/40 font-normal">blocked</span></div>
                   </div>
                </div>
            )}
          </div>
          
          <div className="flex gap-4 shrink-0">
            <div className="bg-white/80 backdrop-blur-sm border border-indigo-100 px-6 py-4 rounded-2xl flex flex-col items-center justify-center min-w-[100px] shadow-sm">
              <span className="text-4xl font-light tracking-tighter text-indigo-600">{progressPct}%</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/50 mt-1">Progress</span>
            </div>
            <div className="flex flex-col gap-2">
                <div className="bg-white/80 backdrop-blur-sm border border-indigo-100 px-5 py-2 rounded-2xl flex items-center justify-between gap-6 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/60">Completed</span>
                  <span className="text-lg font-extrabold text-indigo-600">{completedCount}</span>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-indigo-100 px-5 py-2 rounded-2xl flex items-center justify-between gap-6 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/60">Active</span>
                  <span className="text-lg font-extrabold text-emerald-500">{activeCount}</span>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-indigo-100 px-5 py-2 rounded-2xl flex items-center justify-between gap-6 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-900/60">Blocked</span>
                  <span className="text-lg font-extrabold text-rose-500">{blockedCount}</span>
                </div>
            </div>
          </div>
        </div>
      </div>

      {bundlesToRender.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <HardHat className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-indigo-900">No Execution Scope</h3>
          <p className="text-sm text-slate-500 max-w-md text-center mt-2 mb-4">
            Execution bundles are generated automatically when a formal proposal is approved. You can also manually add custom bundles.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bundlesToRender.map((bundle) => {
          const allClear =
            bundle.gatekeepers.sof &&
            bundle.gatekeepers.gfc &&
            bundle.gatekeepers.payment &&
            bundle.gatekeepers.site;

          if (editingBundleId === bundle.id) {
            return (
              <div key={bundle.id} className="bg-white rounded-2xl border border-indigo-200 ring-4 ring-indigo-50 shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-indigo-950">Edit Bundle</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingBundleId(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bundle Code</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editForm.code || ""}
                      onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bundle Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ops Act Today</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none"
                      value={editForm.actToday || ""}
                      onChange={(e) => setEditForm({ ...editForm, actToday: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Breaks Tomorrow</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none"
                      value={editForm.breaksTomorrow || ""}
                      onChange={(e) => setEditForm({ ...editForm, breaksTomorrow: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleDeleteBundle(bundle.id)}
                    className="flex items-center gap-1.5 px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Bundle
                  </button>
                  <button
                    onClick={() => handleSaveBundle(bundle.id)}
                    className="flex items-center gap-1.5 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                  >
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={bundle.id}
              className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden group ${
                bundle.status === "completed"
                  ? "border-emerald-200 bg-emerald-50/30 opacity-75"
                  : bundle.isOverridden
                  ? "border-amber-300 ring-4 ring-amber-50"
                  : bundle.status === "active"
                    ? "border-emerald-300 ring-4 ring-emerald-50"
                    : bundle.status === "blocked"
                      ? "border-rose-200"
                      : "border-slate-200"
              }`}
            >
              <div className="p-5 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-slate-200">
                      {bundle.code}
                    </span>
                    <h3 className="text-lg font-extrabold text-indigo-950 tracking-tight flex items-center gap-2">
                      {bundle.name}
                      <button 
                        onClick={() => {
                          setEditingBundleId(bundle.id);
                          setEditForm(bundle);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
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
                </div>

                <div className="flex flex-col items-start md:items-end w-full md:w-auto gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl border ${
                        bundle.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : bundle.status === "blocked"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {bundle.status}
                    </span>
                  </div>

                  {bundle.status === "completed" ? (
                    <div className="flex flex-col items-end gap-2">
                        <span className="flex items-center gap-1.5 px-4 py-2 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-xl">
                          <CheckCircle2 className="w-4 h-4" />
                          Execution Completed
                        </span>
                        {!isProjectComplete && (
                          <button
                            onClick={() => {
                              const next = bundlesToRender.map(b => b.id === bundle.id ? {...b, status: b.isOverridden ? 'active' : (allClear ? 'pending' : 'blocked')} : b);
                              updateBundles(next);
                            }}
                            className="text-[10px] text-slate-500 hover:text-slate-700 uppercase font-bold"
                          >
                            Undo Completion
                          </button>
                        )}
                    </div>
                  ) : bundle.isOverridden ? (
                    <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl max-w-sm w-full md:w-80">
                      <div className="flex items-center gap-2 mb-2">
                        <Unlock className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-bold text-amber-800">
                          Proceeding At Risk
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-700 font-medium leading-relaxed mb-3">
                        <strong>Authorized by:</strong> {bundle.overrideAudit?.by}
                        <br />
                        <strong>Justification:</strong> "{bundle.overrideAudit?.reason}"
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRemoveOverride(bundle.id)}
                          className="text-[10px] font-bold text-amber-700 hover:text-amber-900 uppercase tracking-wider flex items-center justify-center gap-1 flex-1 py-1.5 bg-amber-100/50 hover:bg-amber-100 rounded-lg transition-colors"
                        >
                          <Lock className="w-3 h-3" /> Re-engage Gates
                        </button>
                        <button
                          onClick={() => {
                            const next = bundlesToRender.map(b => b.id === bundle.id ? {...b, status: 'completed' as const} : b);
                            updateBundles(next);
                          }}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 uppercase tracking-wider flex items-center justify-center gap-1 flex-1 py-1.5 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </button>
                      </div>
                    </div>
                  ) : !allClear ? (
                    <button
                      onClick={() => setOverrideModalBundleId(bundle.id)}
                      className="flex items-center justify-center gap-2 w-full md:w-auto px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-rose-200"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      Proceed At Risk (Override)
                    </button>
                  ) : bundle.status === "active" ? (
                    <button
                      onClick={() => {
                         const next = bundlesToRender.map(b => b.id === bundle.id ? {...b, status: 'completed' as const} : b);
                         updateBundles(next);
                      }}
                      className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Completed
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                         const next = bundlesToRender.map(b => b.id === bundle.id ? {...b, status: 'active' as const} : b);
                         updateBundles(next);
                      }}
                      className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Start Execution
                    </button>
                  )}
                </div>
              </div>
              
              {/* Intelligence Layer */}
              <div className="bg-slate-50 border-t border-slate-100 p-5 flex flex-col md:flex-row gap-6">
                 <div className="flex-1">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Ops Act Today
                    </h5>
                    <p className="text-sm font-medium text-slate-700">
                        {bundle.actToday || `Clear pending gates for ${bundle.name} to unblock execution.`}
                    </p>
                 </div>
                 <div className="flex-1">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Breaks Tomorrow
                    </h5>
                    <p className="text-sm font-medium text-slate-700">
                        {bundle.breaksTomorrow || `Sequential delivery timeline will be impacted.`}
                    </p>
                 </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* OVERRIDE MODAL */}
      <AnimatePresence>
        {overrideModalBundleId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm"
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
                <h3 className="text-xl font-bold text-indigo-950 mb-2">
                  Authorize Proceed at Risk
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  You are overriding standard execution gates. This bundle will be marked active despite pending blockers. Please provide justification.
                </p>

                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Client verbally approved SOF on site..."
                  className="w-full h-24 p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none mb-6"
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
                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-indigo-950 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:hover:bg-amber-500"
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ${
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
