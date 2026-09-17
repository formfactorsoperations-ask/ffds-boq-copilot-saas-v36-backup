import React, { useState, useEffect } from "react";
import { MOM, MOMActionItem } from "../../types";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { db, auth } from "../../services/firebaseClient";
import {
  CheckCircle2,
  Circle,
  Clock,
  MessageCircle,
  AlertTriangle,
  ExternalLink,
  Calendar,
  Search,
  Filter,
  Trash2,
  FileText,
  Sparkles,
  Plus,
  Loader2,
  Users,
  ChevronRight,
  Gavel,
  CheckCircle,
  Check,
} from "lucide-react";
import { MomReviewModal } from "./MomReviewModal";
import { useOrg } from "../../contexts/OrgContext";
import { createEmptyMoM, createMoMFromNotes } from "../../services/momService";

interface MomActionTrackerProps {
  projectId: string;
  studioId: string;
  projectContextName?: string;
  onOpenMom?: (momId: string) => void;
}

export function MomActionTracker({
  projectId,
  studioId,
  projectContextName,
  onOpenMom,
}: MomActionTrackerProps) {
  const { orgData } = useOrg();
  const [moms, setMoms] = useState<MOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"actions" | "history">("actions");
  const [filter, setFilter] = useState<
    "all" | "open" | "overdue" | "client" | "studio"
  >("open");
  const [selectedMomId, setSelectedMomId] = useState<string | null>(null);
  const [momToDelete, setMomToDelete] = useState<MOM | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create MoM State
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState(new Date().toISOString().split("T")[0]);
  const [createType, setCreateType] = useState<"client" | "internal" | "vendor">("client");
  const [createAttendees, setCreateAttendees] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const currentUser = auth.currentUser;
  const studioName = orgData?.orgName || "Studio";

  useEffect(() => {
    if (!projectId || !studioId) return;
    const q = query(
      collection(db, `organizations/${studioId}/projects/${projectId}/moms`),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MOM);
      setMoms(data);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId, studioId]);

  const toggleActionStatus = async (
    momId: string,
    actionId: string,
    currentStatus: string,
  ) => {
    const mom = moms.find((m) => m.id === momId);
    if (!mom) return;
    const items = mom.actionItems || [];
    const idx = items.findIndex((a) => a.id === actionId);
    if (idx === -1) return;
    const newItems = [...items];
    newItems[idx].status = currentStatus === "open" ? "done" : "open";
    await updateDoc(
      doc(db, `organizations/${studioId}/projects/${projectId}/moms`, momId),
      {
        actionItems: newItems,
      },
    );
  };

  const deleteMom = async (momId: string) => {
    const targetMom = moms.find((m) => m.id === momId);
    if (targetMom) {
      setMomToDelete(targetMom);
    }
  };

  const handleCreateMoM = async (useAI: boolean) => {
    if (!createTitle.trim()) {
      alert("Please enter a meeting title.");
      return;
    }
    setCreating(true);
    try {
      const meetingId = `meeting_${Date.now()}`;
      const parsedDate = new Date(createDate).getTime();
      const attendeeList = createAttendees
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      let momId = "";
      if (useAI) {
        if (!createNotes.trim()) {
          alert("Please provide raw notes/transcripts for Gemini AI to structure.");
          setCreating(false);
          return;
        }
        momId = await createMoMFromNotes(
          studioId,
          projectId,
          projectContextName || "Project",
          meetingId,
          createType,
          createTitle,
          parsedDate,
          createNotes,
          createAttendees,
          currentUser?.uid || "unknown"
        );
      } else {
        momId = await createEmptyMoM(
          studioId,
          projectId,
          meetingId,
          createType,
          createTitle,
          parsedDate,
          currentUser?.uid || "unknown",
          attendeeList
        );
      }

      // Reset Form and close modal
      setCreateTitle("");
      setCreateAttendees("");
      setCreateNotes("");
      setCreateType("client");
      setShowCreateModal(false);

      // Open the newly created MoM immediately in review mode!
      setSelectedMomId(momId);
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to create meeting minutes. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const getFilteredActions = () => {
    let allActions: { action: MOMActionItem; mom: MOM }[] = [];
    moms.forEach((mom) => {
      if (mom.status === "draft") return;
      (mom.actionItems || []).forEach((a) => {
        allActions.push({ action: a, mom });
      });
    });

    const now = Date.now();

    return allActions
      .filter(({ action }) => {
        if (searchQuery) {
          const queryLower = searchQuery.toLowerCase();
          const matchesText = action.text.toLowerCase().includes(queryLower);
          const matchesOwner = (action.owner || "").toLowerCase().includes(queryLower);
          if (!matchesText && !matchesOwner) return false;
        }

        if (filter === "open" && action.status !== "open") return false;
        if (filter === "overdue") {
          if (action.status !== "open") return false;
          if (!action.dueDate || action.dueDate > now) return false;
        }
        if (filter === "client" && action.owner !== "client") return false;
        if (filter === "studio" && action.owner === "client") return false;
        return true;
      })
      .sort((a, b) => {
        const tA = a.action.dueDate || 0;
        const tB = b.action.dueDate || 0;
        if (tA === tB) return b.mom.meetingDate - a.mom.meetingDate;
        if (!tA) return 1;
        if (!tB) return -1;
        return tA - tB;
      });
  };

  const filteredActions = getFilteredActions();
  
  // Total stats counts
  const totalMoms = moms.length;
  const draftMomsCount = moms.filter((m) => m.status === "draft").length;
  const finalizedMomsCount = moms.filter((m) => m.status !== "draft").length;
  
  const openActionsCount = moms.reduce(
    (acc, m) =>
      m.status !== "draft" ? acc + (m.actionItems?.filter((a) => a.status === "open").length || 0) : acc,
    0,
  );
  
  const overdueActionsCount = moms.reduce((acc, m) => {
    if (m.status === "draft") return acc;
    const overdue = (m.actionItems || []).filter(
      (a) => a.status === "open" && a.dueDate && a.dueDate < Date.now()
    ).length;
    return acc + overdue;
  }, 0);

  const totalDecisionsCount = moms.reduce(
    (acc, m) => acc + (m.decisions?.length || 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden relative min-h-[550px] flex flex-col font-sans">
      
      {/* Metric Dashboard Panels (Milky White, Gold / Navy Accents) */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-200/60 bg-[#FAF9F6]/80 backdrop-blur-sm">
        <div className="p-6 flex flex-col justify-between border-r border-slate-200/50">
          <span className="text-xs uppercase font-extrabold tracking-widest text-[#B89047]">Minutes Recorded</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-sans tracking-tight">{totalMoms}</span>
            {draftMomsCount > 0 && (
              <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200 font-bold uppercase tracking-wide">
                {draftMomsCount} Drafts
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 mt-1 font-semibold">Recorded project protocols</span>
        </div>

        <div className="p-6 flex flex-col justify-between border-r border-slate-200/50">
          <span className="text-xs uppercase font-extrabold tracking-widest text-[#B89047]">Open Actions</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-sans tracking-tight">{openActionsCount}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#3D52A0] animate-pulse"></span>
          </div>
          <span className="text-xs text-slate-400 mt-1 font-semibold">Pending action items</span>
        </div>

        <div className="p-6 flex flex-col justify-between border-r border-slate-200/50">
          <span className="text-xs uppercase font-extrabold tracking-widest text-[#B89047]">Overdue Tasks</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-3xl font-black font-sans tracking-tight ${overdueActionsCount > 0 ? "text-red-600" : "text-slate-900"}`}>
              {overdueActionsCount}
            </span>
            {overdueActionsCount > 0 && <AlertTriangle size={15} className="text-red-500" />}
          </div>
          <span className="text-xs text-slate-400 mt-1 font-semibold">Requires follow up</span>
        </div>

        <div className="p-6 flex flex-col justify-between">
          <span className="text-xs uppercase font-extrabold tracking-widest text-[#B89047]">Decisions Logged</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-sans tracking-tight">{totalDecisionsCount}</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <span className="text-xs text-slate-400 mt-1 font-semibold">Aligned agreements</span>
        </div>
      </div>

      {/* Controller & Search Actions Header */}
      <div className="p-6 border-b border-slate-200/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Minutes of Meetings & Actions
            <span className="h-1.5 w-1.5 rounded-full bg-[#B89047]"></span>
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl">
            Review site meeting protocols, track task ownership, and share beautifully formatted PDFs with clients to keep alignment transparent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggle - Segments Slider Accent */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            <button
              onClick={() => setViewMode("actions")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${viewMode === "actions" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
            >
              Action Item Tracker
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${viewMode === "history" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
            >
              Minutes History
            </button>
          </div>

          {/* Record Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white hover:text-amber-400 px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-widest transition duration-200 shadow-sm border border-[#334486]"
          >
            <Plus size={14} />
            Record Meeting
          </button>
        </div>
      </div>

      {/* Filter and Search Bar for Action Tracker */}
      {viewMode === "actions" && (
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === "open"} onClick={() => setFilter("open")}>
              Open ({openActionsCount})
            </FilterButton>
            <FilterButton active={filter === "overdue"} onClick={() => setFilter("overdue")}>
              Overdue ({overdueActionsCount})
            </FilterButton>
            <FilterButton active={filter === "client"} onClick={() => setFilter("client")}>
              Client Action
            </FilterButton>
            <FilterButton active={filter === "studio"} onClick={() => setFilter("studio")}>
              {studioName} Action
            </FilterButton>
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              All Actions
            </FilterButton>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks, owners, refs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none placeholder-slate-400 transition"
            />
          </div>
        </div>
      )}

      {/* Inner Active Viewport */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === "actions" ? (
          filteredActions.length === 0 ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <p className="font-bold text-sm text-slate-900 uppercase tracking-wider">Action list is clear</p>
              <p className="text-xs mt-1.5 max-w-xs text-slate-400">No pending action items match your current selection or search filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#FAF9F6]/80 border-b border-slate-200/60 text-xs uppercase font-extrabold text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-4 px-6 w-16 text-center">Done</th>
                    <th className="py-4 px-6 min-w-[300px]">Task Description</th>
                    <th className="py-4 px-6 w-36">Action Owner</th>
                    <th className="py-4 px-6 w-36">Timeline</th>
                    <th className="py-4 px-6 w-40">MOM Document</th>
                    <th className="py-4 px-6 w-24 text-right">Reminder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredActions.map(({ action, mom }) => {
                    const isOverdue =
                      action.status === "open" &&
                      action.dueDate &&
                      action.dueDate < Date.now();

                    const isStudioOwner = action.owner !== "client";

                    return (
                      <tr
                        key={`${mom.id}-${action.id}`}
                        className="hover:bg-slate-50/60 transition-colors group"
                      >
                        {/* Status Checker */}
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() =>
                              toggleActionStatus(mom.id, action.id, action.status)
                            }
                            className="inline-flex items-center justify-center transition-transform hover:scale-110 p-1 rounded-md hover:bg-slate-100"
                            style={{ minWidth: "44px", minHeight: "44px" }}
                          >
                            {action.status === "done" ? (
                              <CheckCircle size={20} className="text-[#B89047]" />
                            ) : (
                              <Circle size={20} className="text-slate-300 hover:text-slate-900" />
                            )}
                          </button>
                        </td>

                        {/* Task text */}
                        <td className="py-4 px-6">
                          <span
                            className={`text-sm leading-relaxed font-semibold block ${action.status === "done" ? "line-through text-slate-400" : "text-slate-900"}`}
                          >
                            {action.text}
                          </span>
                          <div className="flex gap-2 mt-2">
                            {action.flags?.scope && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 text-[10px] rounded border border-red-100 font-bold uppercase tracking-wider">
                                Scope Impact
                              </span>
                            )}
                            {action.flags?.siteCondition && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] rounded border border-amber-100 font-bold uppercase tracking-wider">
                                Site Issue
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Owner */}
                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${isStudioOwner ? "bg-sky-50 text-slate-900 border-sky-100" : "bg-amber-50/50 text-[#B89047] border-[#B89047]/20"}`}
                          >
                            {isStudioOwner ? studioName : "Client"}
                          </span>
                        </td>

                        {/* Due Date */}
                        <td className="py-4 px-6">
                          {action.dueDate ? (
                            <span
                              className={`text-sm flex items-center gap-1.5 font-bold ${isOverdue ? "text-red-600 font-extrabold" : "text-slate-500"}`}
                            >
                              <Calendar size={13} className="shrink-0 text-slate-400" />
                              {new Date(action.dueDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                              {isOverdue && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm italic">Not set</span>
                          )}
                        </td>

                        {/* Source Document Link */}
                        <td className="py-4 px-6">
                          <button
                            onClick={() => setSelectedMomId(mom.id)}
                            className="inline-flex items-center gap-1.5 text-slate-900 hover:text-[#B89047] text-sm font-bold uppercase tracking-wider transition"
                          >
                            <ExternalLink size={12} className="shrink-0 opacity-60 group-hover:opacity-100" />
                            {mom.momRef}
                          </button>
                          <p className="text-xs text-slate-400 font-semibold mt-1">
                            {new Date(mom.meetingDate).toLocaleDateString("en-GB")}
                          </p>
                        </td>

                        {/* WA Reminder Nudge */}
                        <td className="py-4 px-6 text-right">
                          {action.status === "open" && action.owner === "client" ? (
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Dear Client,\n\nJust a gentle reminder regarding an outstanding action item from our project discussion on ${new Date(mom.meetingDate).toLocaleDateString("en-GB")} (${mom.momRef}):\n\n📌 *Pending Action:* ${action.text}\n\nThank you for helping us keep the execution timeline on track!`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200/60 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition"
                              style={{ minHeight: "36px" }}
                            >
                              <MessageCircle size={12} />
                              Nudge
                            </a>
                          ) : (
                            <span className="text-slate-300 text-xs italic">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : moms.length === 0 ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
              <FileText size={24} className="text-slate-300" />
            </div>
            <p className="font-bold text-sm text-slate-900 uppercase tracking-wider">No minutes recorded</p>
            <p className="text-xs mt-1.5 max-w-xs text-slate-400">Record your first site meeting or client discussion to start tracking logs.</p>
          </div>
        ) : (
          /* MOM History Cards Grid (Sober, Print-first Aesthetic) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50/50">
            {moms.map((mom) => (
              <div
                key={mom.id}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative"
              >
                {/* Thin elegant top gold highlight bar only for finalized documents */}
                {mom.status !== "draft" && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#B89047] rounded-t-2xl"></div>
                )}

                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-extrabold text-slate-900 tracking-tight text-base group-hover:text-[#B89047] transition-colors flex items-center gap-2">
                        {mom.momRef}
                        {mom.status === "draft" && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-bold uppercase tracking-wider">
                            Draft
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-1.5">
                        <Calendar size={11} className="text-slate-400" />
                        {new Date(mom.meetingDate).toLocaleDateString("en-GB")}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border ${
                        mom.status === "acknowledged"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : mom.status === "shared"
                            ? "bg-sky-50 text-slate-900 border-sky-200"
                            : mom.status === "finalised"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}
                    >
                      {mom.status}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-slate-900 leading-relaxed mb-4 line-clamp-1">
                    {mom.meetingTitle}
                  </p>

                  <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-slate-50/80 border border-slate-200/50 rounded-xl text-center">
                    <div className="flex flex-col">
                      <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Decisions</span>
                      <span className="text-base font-black text-slate-900 mt-1">
                        {mom.decisions?.length || 0}
                      </span>
                    </div>
                    <div className="flex flex-col border-x border-slate-200/60">
                      <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Actions</span>
                      <span className="text-base font-black text-slate-900 mt-1">
                        {mom.actionItems?.length || 0}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Open Tasks</span>
                      <span className="text-base font-black text-[#B89047] mt-1">
                        {mom.actionItems?.filter((a) => a.status === "open").length || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedMomId(mom.id)}
                    className="text-slate-900 hover:text-[#B89047] text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 transition"
                  >
                    <ExternalLink size={13} />
                    {mom.status === "draft" ? "Edit Minutes" : "View Details"}
                  </button>
                  <button
                    onClick={() => deleteMom(mom.id)}
                    className="text-slate-300 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                    title="Delete MoM"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Record / Create Minutes Dialog Overlay */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 z-[100] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {creating ? (
              <div className="p-16 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-[#FAF9F6] border border-slate-200/80 rounded-full flex items-center justify-center mb-2 text-[#B89047]">
                  <Sparkles className="animate-spin duration-3000 text-[#B89047]" size={32} />
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wider">Gemini AI Structuring...</h2>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  Synthesizing transcript content, mapping attendees, assessing design scope impact, and drafting the formalized minutes protocol.
                </p>
                <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 bg-[#B89047] w-1/2 animate-pulse"></div>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-[#FAF9F6]">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      Record Meeting Minutes
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B89047]"></span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      Capture meeting details, catalog decisions, and assign trackable action items.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full p-2.5 hover:shadow-sm hover:bg-slate-50 transition"
                  >
                    ✕
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-5 text-sm">
                  {/* Title & Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#B89047] mb-2">Meeting Agenda / Title</label>
                      <input
                        type="text"
                        placeholder="e.g., Wardrobe Layout Review, Electrical Walkthrough"
                        value={createTitle}
                        onChange={(e) => setCreateTitle(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none rounded-xl text-sm text-slate-900 font-semibold transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#B89047] mb-2">Meeting Date</label>
                      <input
                        type="date"
                        value={createDate}
                        onChange={(e) => setCreateDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none rounded-xl text-sm text-slate-900 font-semibold transition"
                      />
                    </div>
                  </div>

                  {/* Type & Attendees */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#B89047] mb-2">Meeting Type</label>
                      <select
                        value={createType}
                        onChange={(e) => setCreateType(e.target.value as any)}
                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none rounded-xl text-sm text-slate-900 font-semibold transition"
                      >
                        <option value="client">Client Alignment</option>
                        <option value="internal">Internal Team Review</option>
                        <option value="vendor">Vendor Alignment</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#B89047] mb-2">Attendees (Comma Separated)</label>
                      <input
                        type="text"
                        placeholder="e.g., Amit Sharma, Rajesh Gupta, Priya Malhotra"
                        value={createAttendees}
                        onChange={(e) => setCreateAttendees(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none rounded-xl text-sm text-slate-900 font-semibold transition"
                      />
                    </div>
                  </div>

                  {/* Notes / Transcript */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#B89047]">
                        Raw Notes / Discussion Transcript
                      </label>
                      <span className="text-xs text-slate-900 bg-sky-50 border border-sky-100 px-2.5 py-1 rounded-md font-extrabold uppercase tracking-widest flex items-center gap-1">
                        <Sparkles size={11} className="text-[#B89047]" /> AI Autocomplete
                      </span>
                    </div>
                    <textarea
                      placeholder="Paste meeting transcripts, audio logs, voice notes, rough bullet points, or immediate decision highlights here. Gemini AI will automatically parse and structure this into clean Minutes of Meeting containing defined decisions and action plans with scope tracking."
                      value={createNotes}
                      onChange={(e) => setCreateNotes(e.target.value)}
                      className="w-full h-44 px-4 py-3.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-sky-950/20 focus:border-[#334486] outline-none rounded-xl text-sm text-slate-900 leading-relaxed resize-none font-semibold transition"
                    />
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-6 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleCreateMoM(false)}
                    className="flex-1 py-3 bg-white text-slate-900 hover:bg-slate-100/80 border border-slate-200 rounded-xl font-bold text-sm uppercase tracking-wider transition"
                  >
                    Quick Manual Entry
                  </button>

                  <button
                    onClick={() => handleCreateMoM(true)}
                    className="flex-1 py-3 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white hover:text-amber-400 rounded-xl font-bold text-sm uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Sparkles size={14} className="text-amber-400" />
                    Structure with Gemini AI
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Review and Edit Modal */}
      {selectedMomId && moms.some((m) => m.id === selectedMomId) && (
        <MomReviewModal
          mom={moms.find((m) => m.id === selectedMomId)!}
          projectId={projectId}
          studioId={studioId}
          projectContextName={projectContextName}
          onClose={() => setSelectedMomId(null)}
        />
      )}

      {momToDelete && (
        <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 z-[110] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-full">
                <Trash2 size={20} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Delete Minutes of Meeting</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete the Minutes of Meeting <span className="font-semibold text-slate-700">{momToDelete.momRef}</span> ({momToDelete.meetingTitle})? This action is permanent and cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setMomToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = momToDelete.id;
                  setMomToDelete(null);
                  try {
                    await deleteDoc(
                      doc(
                        db,
                        `organizations/${studioId}/projects/${projectId}/moms`,
                        id,
                      ),
                    );
                  } catch (error) {
                    console.error("Error deleting MoM: ", error);
                    alert("Failed to delete MoM. Please try again.");
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm hover:shadow transition"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border transition duration-200 ${active ? "bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white border-[#334486] shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"}`}
    >
      {children}
    </button>
  );
}
