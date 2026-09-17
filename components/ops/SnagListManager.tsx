import React, { useState, useMemo, useEffect } from "react";
import { ProjectContext, SnagItem } from "../../types";
import { generateId } from "../../lib/utils";
import { prepareClonedDocForPdf } from "../../lib/pdfUtils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Trash2, 
  Search, 
  Filter, 
  User, 
  ClipboardList, 
  AlertCircle, 
  X,
  PlusCircle,
  MessageSquare,
  Sparkles,
  ChevronDown,
  Check,
  Zap,
  Printer,
  ChevronRight,
  BookOpen,
  History,
  FileCheck,
  CheckSquare,
  Download
} from "lucide-react";
import { formatINR } from "../../lib/utils";

// Trade categories with highly polished pre-set snag items for quick logging
const DEFAULT_TILES = [
  { category: "Carpentry & Hardware", text: "Cabinet door hinge misaligned / door sagging", severity: "medium" as const },
  { category: "Carpentry & Hardware", text: "Laminate chipped or bubbling on cabinet edge", severity: "medium" as const },
  { category: "Carpentry & Hardware", text: "Soft-close drawer slider sticking or stiff", severity: "medium" as const },
  { category: "Carpentry & Hardware", text: "Wardrobe / drawer handle loose or missing", severity: "low" as const },
  { category: "Carpentry & Hardware", text: "Edge banding tape peeling / sharp edges", severity: "medium" as const },

  { category: "Paint & Finish", text: "Wall paint touch-up needed / patchy finish", severity: "low" as const },
  { category: "Paint & Finish", text: "Ceiling paint peeling or showing dampness", severity: "high" as const },
  { category: "Paint & Finish", text: "Wallpaper seam peeling at joint / corner", severity: "medium" as const },
  { category: "Paint & Finish", text: "Uneven skirting border paint / splatters", severity: "low" as const },
  { category: "Paint & Finish", text: "Cracks visible near window frame plastering", severity: "medium" as const },

  { category: "Electrical & Lighting", text: "Switchboard plate loose or crooked", severity: "medium" as const },
  { category: "Electrical & Lighting", text: "LED strip lighting flickering / dead spots", severity: "medium" as const },
  { category: "Electrical & Lighting", text: "Power socket not live / faulty wiring", severity: "high" as const },
  { category: "Electrical & Lighting", text: "Profile light diffuser cover loose", severity: "low" as const },
  { category: "Electrical & Lighting", text: "Two-way switch operation incorrect", severity: "medium" as const },

  { category: "Civil & Tiling", text: "Grouting missing or uneven between floor tiles", severity: "medium" as const },
  { category: "Civil & Tiling", text: "Floor tile corner chipped or hairline crack", severity: "high" as const },
  { category: "Civil & Tiling", text: "Hollow thud sound under tile (poor backing)", severity: "medium" as const },
  { category: "Civil & Tiling", text: "Bathroom drain slope incorrect (water pooling)", severity: "high" as const },
  { category: "Civil & Tiling", text: "Granite counter joint silicon filling missing", severity: "low" as const },
];

interface SnagListManagerProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
}

export default function SnagListManager({ projectContext, setProjectContext }: SnagListManagerProps) {
  // Local state for UI controls
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");

  // Mode state: Smart Walkthrough vs Detailed Manual Form
  const [loggingMode, setLoggingMode] = useState<"smart" | "manual">("smart");

  // State for active trade filter in Smart Walkthrough
  const [selectedTrade, setSelectedTrade] = useState<string>("Carpentry & Hardware");

  // Form state (Shared)
  const [newRoomId, setNewRoomId] = useState("");
  const [customRoomName, setCustomRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [raisedBy, setRaisedBy] = useState<"designer" | "site_supervisor" | "client" | "owner">("site_supervisor");
  const [notes, setNotes] = useState("");

  // Feedback animation state when quickly logging
  const [justLoggedFeedback, setJustLoggedFeedback] = useState<string | null>(null);

  // Self-Learning Dictionary State
  const [learnedTiles, setLearnedTiles] = useState<Array<{ text: string; severity: "low" | "medium" | "high"; count: number }>>(() => {
    if (projectContext.learnedSnags && projectContext.learnedSnags.length > 0) {
      return projectContext.learnedSnags;
    }
    try {
      const stored = localStorage.getItem(`learned_snags_${projectContext.name || "default"}`);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync state if learnedSnags changes from external database updates
  useEffect(() => {
    if (projectContext.learnedSnags) {
      setLearnedTiles(projectContext.learnedSnags);
    }
  }, [projectContext.learnedSnags]);

  // Load self-learned tiles from localStorage on mount if database list is empty
  useEffect(() => {
    if (!projectContext.learnedSnags || projectContext.learnedSnags.length === 0) {
      try {
        const stored = localStorage.getItem(`learned_snags_${projectContext.name || "default"}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setLearnedTiles(parsed);
          setProjectContext((prev) => ({
            ...prev,
            learnedSnags: parsed
          }));
        }
      } catch (e) {
        console.error("Failed to load learned snags", e);
      }
    }
  }, [projectContext.name]);

  // Client Presentation Report Modal State
  const [showClientReport, setShowClientReport] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    const el = document.getElementById("snaglist-audit-report-render");
    if (!el) return;

    setIsDownloadingPdf(true);
    try {
      const html2pdfModule = await import("html2pdf.js");
      let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
      if (html2pdfObj && html2pdfObj.default) {
        html2pdfObj = html2pdfObj.default;
      }

      if (typeof html2pdfObj !== "function") {
        throw new Error("html2pdf library loaded incorrectly");
      }

      const opt = {
        margin: [15, 15, 15, 15],
        filename: `Snag_List_Audit_Report_${(projectContext.name || "Project").replace(/\s+/g, "_")}.pdf`,
        image: { type: "jpeg", quality: 1 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc, "snaglist-audit-report-render")
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      };

      await html2pdfObj().set(opt).from(el).save();
      setIsDownloadingPdf(false);
    } catch (err) {
      console.error("PDF generation failed", err);
      setIsDownloadingPdf(false);
    }
  };

  // Inline note editing state
  const [activeNotesEditId, setActiveNotesEditId] = useState<string | null>(null);
  const [tempNotesText, setTempNotesText] = useState("");

  const snags = useMemo(() => projectContext.snagList || [], [projectContext.snagList]);

  // Rooms extracted from projectContext
  const availableRooms = useMemo(() => {
    const rawRooms = projectContext.rooms || [];
    return rawRooms.map((room, idx) => ({
      ...room,
      id: (room as any).id || room.name || `room-${idx}`
    }));
  }, [projectContext.rooms]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = snags.length;
    const open = snags.filter((s) => s.status === "open").length;
    const inProgress = snags.filter((s) => s.status === "in_progress").length;
    const resolved = snags.filter((s) => s.status === "resolved").length;
    const verified = snags.filter((s) => s.status === "verified").length;

    const highSeverity = snags.filter((s) => s.severity === "high" && s.status !== "verified").length;
    const activeTotal = open + inProgress + resolved;

    return { total, open, inProgress, resolved, verified, highSeverity, activeTotal };
  }, [snags]);

  // Filter and search logic
  const filteredSnags = useMemo(() => {
    return snags.filter((snag) => {
      const matchesSearch =
        snag.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (snag.assignedTo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (snag.notes || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" ? true : snag.status === statusFilter;
      const matchesSeverity = severityFilter === "all" ? true : snag.severity === severityFilter;
      const matchesRoom = roomFilter === "all" ? true : snag.roomId === roomFilter;

      return matchesSearch && matchesStatus && matchesSeverity && matchesRoom;
    }).sort((a, b) => b.raisedAt - a.raisedAt); // Newest first
  }, [snags, searchQuery, statusFilter, severityFilter, roomFilter]);

  // Function to learn a newly typed phrase
  const learnPhrase = (phrase: string, initialSeverity: "low" | "medium" | "high") => {
    const cleanPhrase = phrase.trim();
    if (!cleanPhrase || cleanPhrase.length < 5) return;

    // Check if it already exists in defaults or current learned
    const isDefault = DEFAULT_TILES.some(t => t.text.toLowerCase() === cleanPhrase.toLowerCase());
    if (isDefault) return;

    const copy = [...learnedTiles];
    const matchIndex = copy.findIndex(t => t.text.toLowerCase() === cleanPhrase.toLowerCase());

    if (matchIndex > -1) {
      copy[matchIndex].count += 1;
    } else {
      copy.push({ text: cleanPhrase, severity: initialSeverity, count: 1 });
    }

    // Sort by frequency
    copy.sort((a, b) => b.count - a.count);

    // Keep top 12 learned phrases to avoid visual clutter
    const trimmed = copy.slice(0, 12);

    setLearnedTiles(trimmed);
    
    // Save to localStorage
    try {
      localStorage.setItem(`learned_snags_${projectContext.name || "default"}`, JSON.stringify(trimmed));
    } catch (e) {
      console.error("Failed to save learned snags", e);
    }

    // Save to database
    setProjectContext((prev) => ({
      ...prev,
      learnedSnags: trimmed
    }));
  };

  // Helper to resolve room ID into clean name
  const getRoomMeta = (roomId: string) => {
    if (roomId === "unassigned") return { id: "unassigned", name: "General / Unassigned" };
    const roomObj = availableRooms.find(r => r.id === roomId);
    return {
      id: roomId,
      name: roomObj ? roomObj.name : "General / Unassigned"
    };
  };

  // Form submission (Manual / Traditional)
  const handleAddSnagManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    // Determine room details
    let finalRoomId = newRoomId;
    let finalRoomName = "General / Unassigned";

    if (newRoomId === "custom") {
      finalRoomId = "custom_" + Date.now();
      finalRoomName = customRoomName.trim() || "Custom Area";
    } else if (newRoomId && newRoomId !== "unassigned") {
      const roomMeta = getRoomMeta(newRoomId);
      finalRoomId = roomMeta.id;
      finalRoomName = roomMeta.name;
    } else {
      finalRoomId = "unassigned";
      finalRoomName = "General / Unassigned";
    }

    const newItem: SnagItem = {
      id: "snag_" + generateId(),
      roomId: finalRoomId,
      roomName: finalRoomName,
      description: description.trim(),
      severity,
      status: "open",
      raisedBy,
      raisedAt: Date.now(),
      assignedTo: assignedTo.trim() || undefined,
      notes: notes.trim() || undefined
    };

    // Self-learn if manually typed
    learnPhrase(description.trim(), severity);

    // Update ProjectContext
    setProjectContext((prev) => ({
      ...prev,
      snagList: [newItem, ...(prev.snagList || [])]
    }));

    // Trigger visual toast-like success
    setJustLoggedFeedback(`Successfully logged: "${description.trim().substring(0, 40)}..."`);
    setTimeout(() => setJustLoggedFeedback(null), 3000);

    // Reset Form
    setDescription("");
    setSeverity("medium");
    setNotes("");
    setAssignedTo("");
  };

  // Super Fast Tap-to-Log Submission (From smart tiles)
  const handleSmartTileLog = (tileText: string, tileSeverity: "low" | "medium" | "high") => {
    if (!newRoomId) {
      alert("Please select a Location/Room first at the top of the logging dashboard.");
      return;
    }

    // Determine room details
    let finalRoomId = newRoomId;
    let finalRoomName = "General / Unassigned";

    if (newRoomId === "custom") {
      finalRoomId = "custom_" + Date.now();
      finalRoomName = customRoomName.trim() || "Custom Area";
    } else {
      const roomMeta = getRoomMeta(newRoomId);
      finalRoomId = roomMeta.id;
      finalRoomName = roomMeta.name;
    }

    const newItem: SnagItem = {
      id: "snag_" + generateId(),
      roomId: finalRoomId,
      roomName: finalRoomName,
      description: tileText,
      severity: tileSeverity,
      status: "open",
      raisedBy,
      raisedAt: Date.now(),
      assignedTo: assignedTo.trim() || undefined,
      notes: notes.trim() || undefined
    };

    // Update ProjectContext
    setProjectContext((prev) => ({
      ...prev,
      snagList: [newItem, ...(prev.snagList || [])]
    }));

    // Trigger feedback notification
    setJustLoggedFeedback(`Logged inside "${finalRoomName}": ${tileText}`);
    setTimeout(() => setJustLoggedFeedback(null), 3500);
  };

  // Status transitions
  const updateSnagStatus = (id: string, newStatus: SnagItem["status"]) => {
    setProjectContext((prev) => {
      const list = prev.snagList || [];
      const updatedList = list.map((item) => {
        if (item.id === id) {
          const updates: Partial<SnagItem> = { status: newStatus };
          if (newStatus === "resolved") {
            updates.resolvedAt = Date.now();
            updates.resolvedBy = "Site Ops Team";
          } else if (newStatus === "verified") {
            updates.notes = (item.notes ? item.notes + "\n" : "") + `[System: Verified and closed at ${new Date().toLocaleDateString()}]`;
          }
          return { ...item, ...updates };
        }
        return item;
      });
      return { ...prev, snagList: updatedList };
    });
  };

  // Inline notes update
  const saveSnagNotes = (id: string) => {
    setProjectContext((prev) => {
      const list = prev.snagList || [];
      const updatedList = list.map((item) => {
        if (item.id === id) {
          return { ...item, notes: tempNotesText.trim() || undefined };
        }
        return item;
      });
      return { ...prev, snagList: updatedList };
    });
    setActiveNotesEditId(null);
    setTempNotesText("");
  };

  // Delete item
  const handleDeleteSnag = (id: string) => {
    if (window.confirm("Are you sure you want to delete this snag item? This cannot be undone.")) {
      setProjectContext((prev) => ({
        ...prev,
        snagList: (prev.snagList || []).filter((item) => item.id !== id)
      }));
    }
  };

  // Clean-up learned dictionary
  const handleClearLearned = () => {
    if (window.confirm("Do you want to reset your self-learned defect dictionary?")) {
      setLearnedTiles([]);
      localStorage.removeItem(`learned_snags_${projectContext.name || "default"}`);
      setProjectContext((prev) => ({
        ...prev,
        learnedSnags: []
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#3D52A0]" />
            Site Snag List & Defect Tracker
          </h3>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Log site defects, assign contractor actions, and track resolutions room-by-room.
          </p>
        </div>
      </div>

      {/* Overview Dashboard Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Snags</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-slate-800 tabular-nums">{stats.total}</span>
            <span className="text-xs text-slate-400">logged</span>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/20 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 font-extrabold">Unresolved Items</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-rose-600 tabular-nums">{stats.open + stats.inProgress}</span>
            <span className="text-xs text-slate-400">active</span>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/20 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 font-bold">Critical (High)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-amber-600 tabular-nums">{stats.highSeverity}</span>
            <span className="text-xs text-amber-500 font-semibold">unverified</span>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/20 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 font-bold">Awaiting Client Approval</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-blue-600 tabular-nums">{stats.resolved}</span>
            <span className="text-xs text-blue-400 font-semibold">resolved</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 col-span-2 lg:col-span-1 flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-extrabold">Client Verified</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-600 tabular-nums">{stats.verified}</span>
            <span className="text-xs text-emerald-500 font-bold">closed ({stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}%)</span>
          </div>
        </div>
      </div>

      {/* Action Header & Filtering */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search descriptions, contractor, or remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3D52A0] bg-slate-50/30"
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

        {/* Filters Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            Filter:
          </div>

          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3D52A0] cursor-pointer"
          >
            <option value="all">All Rooms</option>
            {availableRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
            <option value="unassigned">General / Unassigned</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3D52A0] cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="verified">Verified & Closed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3D52A0] cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="high">🔥 High</option>
            <option value="medium">⚡ Medium</option>
            <option value="low">⚙️ Low</option>
          </select>

          {/* Export Report Trigger */}
          <button
            onClick={() => setShowClientReport(true)}
            className="flex items-center gap-1.5 border border-amber-200 bg-amber-50/60 hover:bg-amber-100 text-amber-900 px-3.5 py-2 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-all"
            title="Export elegant printable report for client sign-off"
          >
            <Printer className="w-3.5 h-3.5 text-amber-600" />
            Client Report
          </button>

          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm && !newRoomId && availableRooms.length > 0) {
                // Pre-populate room to avoid alert
                setNewRoomId(availableRooms[0].id);
              }
            }}
            className="flex items-center gap-1.5 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white px-4 py-2 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-all shadow-sm ml-2"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            Log Snags
          </button>
        </div>
      </div>

      {/* Quick-logging notification banner feedback */}
      <AnimatePresence>
        {justLoggedFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-600 text-white px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold tracking-wide shadow-md"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300 animate-bounce" />
              <span>{justLoggedFeedback}</span>
            </div>
            <span className="text-[9px] bg-emerald-800 text-emerald-100 uppercase font-black px-2 py-0.5 rounded-md">Logged Instantly</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Logging Drawer: Smart Walkthrough vs Manual */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-5">
              {/* Drawer Header & Mode Switcher */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-3.5 gap-3">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> Log Defect / Work-to-Complete
                  </span>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Select a room, then log using rapid Smart Tiles or manual description.
                  </p>
                </div>

                {/* Sub Mode Toggles */}
                <div className="bg-slate-200/70 p-1 rounded-xl flex items-center border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setLoggingMode("smart")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all ${
                      loggingMode === "smart"
                        ? "bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    1-Tap Smart Walkthrough
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoggingMode("manual")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all ${
                      loggingMode === "manual"
                        ? "bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Bespoke Form
                  </button>
                </div>
              </div>

              {/* SHARED LOCATION & META PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                {/* Location / Room Picker (Crucial for rapid entry) */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Active Audit Location <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newRoomId}
                    onChange={(e) => {
                      setNewRoomId(e.target.value);
                      if (e.target.value !== "custom") setCustomRoomName("");
                    }}
                    className="w-full text-sm font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#3D52A0] cursor-pointer"
                  >
                    <option value="">Select Room / Location...</option>
                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                    <option value="unassigned">General / Unassigned</option>
                    <option value="custom">Other (Enter Custom Area)...</option>
                  </select>

                  {newRoomId === "custom" && (
                    <input
                      type="text"
                      placeholder="Enter custom area name..."
                      value={customRoomName}
                      onChange={(e) => setCustomRoomName(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-200 rounded-xl px-3 py-2 mt-1.5 focus:outline-none focus:ring-1 focus:ring-[#3D52A0]"
                      required
                    />
                  )}
                </div>

                {/* Assigned Contractor / Vendor (Will apply to logged items) */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Assigned Trade / Contractor
                  </label>
                  <input
                    type="text"
                    placeholder="E.g., Carpentry Team, Painting Team..."
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full text-sm font-medium border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-[#3D52A0]"
                  />
                </div>

                {/* Raised By */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Audit Auditor
                  </label>
                  <select
                    value={raisedBy}
                    onChange={(e: any) => setRaisedBy(e.target.value)}
                    className="w-full text-sm font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#3D52A0] cursor-pointer"
                  >
                    <option value="site_supervisor">Site Supervisor</option>
                    <option value="designer">Interior Designer</option>
                    <option value="client">Client Walkthrough</option>
                    <option value="owner">Studio Owner</option>
                  </select>
                </div>
              </div>

              {/* MODE 1: SMART WALKTHROUGH TILING INTERFACE */}
              {loggingMode === "smart" && (
                <div className="space-y-4">
                  {/* Warning if no room picked */}
                  {!newRoomId && (
                    <div className="p-3 bg-amber-50 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-2 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      Please choose an Active Audit Location above to enable instant 1-tap logging.
                    </div>
                  )}

                  {/* Trade filter buttons inside smart tiles */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
                    {["Carpentry & Hardware", "Paint & Finish", "Electrical & Lighting", "Civil & Tiling", "Custom Dictionary"].map((trade) => {
                      if (trade === "Custom Dictionary" && learnedTiles.length === 0) return null;
                      return (
                        <button
                          key={trade}
                          type="button"
                          onClick={() => setSelectedTrade(trade)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border ${
                            selectedTrade === trade
                              ? "bg-slate-800 border-slate-800 text-white font-extrabold shadow-sm"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {trade === "Custom Dictionary" ? "🧠 Learned Items" : trade}
                        </button>
                      );
                    })}

                    {selectedTrade === "Custom Dictionary" && learnedTiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearLearned}
                        className="ml-auto text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase"
                      >
                        Reset Learned
                      </button>
                    )}
                  </div>

                  {/* Smart Tiles Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {selectedTrade === "Custom Dictionary" ? (
                      learnedTiles.map((tile, idx) => (
                        <button
                          key={`learned-${idx}`}
                          type="button"
                          disabled={!newRoomId}
                          onClick={() => handleSmartTileLog(tile.text, tile.severity)}
                          className={`group text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 bg-sky-50/20 hover:bg-sky-50/70 border-sky-100 ${
                            !newRoomId ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-sky-300 hover:translate-y-[-1px] hover:shadow-sm"
                          }`}
                        >
                          <span className="mt-0.5 shrink-0 bg-sky-100 text-[#334486] p-1 rounded-md group-hover:bg-sky-200">
                            <BookOpen className="w-3 h-3" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2">
                              {tile.text}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-[#3D52A0] bg-sky-50 px-1 rounded">
                                custom ({tile.count}x)
                              </span>
                              <span className="text-slate-300 text-[9px]">•</span>
                              <span className={`text-[8px] font-bold uppercase tracking-wider ${
                                tile.severity === "high" ? "text-rose-500" : tile.severity === "medium" ? "text-amber-600" : "text-slate-400"
                              }`}>
                                {tile.severity} impact
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 self-center ml-auto" />
                        </button>
                      ))
                    ) : (
                      DEFAULT_TILES.filter(t => t.category === selectedTrade).map((tile, idx) => (
                        <button
                          key={`tile-${idx}`}
                          type="button"
                          disabled={!newRoomId}
                          onClick={() => handleSmartTileLog(tile.text, tile.severity)}
                          className={`group text-left p-3 rounded-xl border bg-white border-slate-200 transition-all flex items-start gap-2.5 ${
                            !newRoomId ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-slate-300 hover:bg-slate-50/80 hover:translate-y-[-1px] hover:shadow-sm"
                          }`}
                        >
                          <span className={`mt-0.5 shrink-0 p-1 rounded-md ${
                            tile.severity === "high" 
                              ? "bg-rose-50 text-rose-600 group-hover:bg-rose-100" 
                              : tile.severity === "medium" 
                              ? "bg-amber-50 text-amber-700 group-hover:bg-amber-100" 
                              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                          }`}>
                            <Zap className="w-3 h-3" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2">
                              {tile.text}
                            </p>
                            <span className={`inline-block text-[8px] font-bold uppercase tracking-wider mt-1 ${
                              tile.severity === "high" ? "text-rose-500" : tile.severity === "medium" ? "text-amber-600" : "text-slate-400"
                            }`}>
                              {tile.severity} impact
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 self-center ml-auto" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* MODE 2: BESPOKE MANUAL DESCRIPTION FORM */}
              {loggingMode === "manual" && (
                <form onSubmit={handleAddSnagManual} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Defect Description input with self-learning hints */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Bespoke Defect / Snag Description <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={2}
                        placeholder="E.g., master bathroom countertop slab joint silicon peeling, wardrobe soft close hinges slamming..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full text-sm font-medium border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#3D52A0]"
                        required
                      />
                    </div>

                    {/* Impact Severity */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Defect Impact Severity
                      </label>
                      <div className="flex gap-2">
                        {(["low", "medium", "high"] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setSeverity(level)}
                            className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                              severity === level
                                ? level === "high"
                                  ? "bg-rose-50 border-rose-500 text-rose-700 font-extrabold shadow-sm shadow-rose-100"
                                  : level === "medium"
                                  ? "bg-amber-50 border-amber-500 text-amber-700 font-extrabold shadow-sm shadow-amber-100"
                                  : "bg-slate-100 border-slate-400 text-slate-700 font-extrabold shadow-sm"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {level === "high" ? "🔥 High" : level === "medium" ? "⚡ Med" : "⚙️ Low"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Remarks & Notes */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Initial Remarks & Progress Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Add any specific context or work-to-complete resolution guidelines..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-200 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-[#3D52A0]"
                    />
                  </div>

                  {/* Submission buttons */}
                  <div className="flex justify-end gap-2.5 pt-1.5 border-t border-slate-200/50">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-700 tracking-wider"
                    >
                      Close Form
                    </button>
                    <button
                      type="submit"
                      className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 hover:bg-[#334486] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                    >
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                      Log Snag & Learn
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snag Items List / Grid View */}
      <div className="space-y-3">
        {filteredSnags.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500">No snag items match filters</p>
            <p className="text-xs text-slate-400 mt-1">
              Either your filters are too strict, or this site is completely snag-free!
            </p>
          </div>
        ) : (
          filteredSnags.map((snag) => (
            <motion.div
              layout
              key={snag.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border bg-white p-4 transition-all shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between ${
                snag.status === "verified"
                  ? "border-emerald-100 bg-emerald-50/5"
                  : snag.severity === "high"
                  ? "border-rose-100 bg-rose-50/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="space-y-2 flex-1">
                {/* Meta Row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Location Tag */}
                  <span className="text-[11px] font-extrabold text-slate-900 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-100">
                    {snag.roomName}
                  </span>

                  {/* Severity Badge */}
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      snag.severity === "high"
                        ? "bg-rose-50 border-rose-100 text-rose-600"
                        : snag.severity === "medium"
                        ? "bg-amber-50 border-amber-100 text-amber-700"
                        : "bg-slate-50 border-slate-100 text-slate-500"
                    }`}
                  >
                    {snag.severity} impact
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                      snag.status === "verified"
                        ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                        : snag.status === "resolved"
                        ? "bg-blue-50 border-blue-100 text-blue-600"
                        : snag.status === "in_progress"
                        ? "bg-orange-50 border-orange-100 text-orange-600"
                        : "bg-slate-100 border-slate-200 text-slate-600"
                    }`}
                  >
                    {snag.status === "verified" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : snag.status === "in_progress" ? (
                      <Clock className="w-3 h-3 animate-pulse" />
                    ) : null}
                    {snag.status.replace("_", " ")}
                  </span>

                  <span className="text-slate-300 text-xs">•</span>

                  <span className="text-[10px] text-slate-400 font-medium">
                    Logged {new Date(snag.raisedAt).toLocaleDateString()} by {snag.raisedBy.replace("_", " ")}
                  </span>
                </div>

                {/* Description */}
                <p className="text-sm font-semibold text-slate-800 leading-snug">
                  {snag.description}
                </p>

                {/* Progress Notes & Assignee */}
                <div className="flex flex-col gap-1.5 pt-1">
                  {snag.assignedTo && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Assigned Contractor: <strong className="text-slate-700 font-bold">{snag.assignedTo}</strong>
                    </div>
                  )}

                  {/* Progress Notes Block */}
                  {activeNotesEditId === snag.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={tempNotesText}
                        onChange={(e) => setTempNotesText(e.target.value)}
                        placeholder="Update progress or closure remarks..."
                        className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3D52A0] bg-white flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() => saveSnagNotes(snag.id)}
                        className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white p-1.5 rounded-lg hover:bg-[#334486] transition-colors"
                        title="Save Notes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setActiveNotesEditId(null)}
                        className="bg-slate-100 text-slate-500 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 text-xs text-slate-500 bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider block">Remarks / Notes</span>
                        <p className="italic text-slate-600 mt-0.5 whitespace-pre-line">
                          {snag.notes || "No extra progress comments logged yet."}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setActiveNotesEditId(snag.id);
                          setTempNotesText(snag.notes || "");
                        }}
                        className="text-[10px] font-bold text-[#3D52A0] hover:text-[#334486] uppercase px-2 py-1 bg-white hover:bg-slate-100 rounded-md border border-slate-100 transition-colors"
                      >
                        Edit Notes
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                {snag.status === "open" && (
                  <button
                    onClick={() => updateSnagStatus(snag.id, "in_progress")}
                    className="flex-1 md:flex-initial bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    Start Work
                  </button>
                )}

                {(snag.status === "open" || snag.status === "in_progress") && (
                  <button
                    onClick={() => updateSnagStatus(snag.id, "resolved")}
                    className="flex-1 md:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    Mark Resolved
                  </button>
                )}

                {snag.status === "resolved" && (
                  <>
                    <button
                      onClick={() => updateSnagStatus(snag.id, "verified")}
                      className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                      Verify & Close
                    </button>
                    <button
                      onClick={() => updateSnagStatus(snag.id, "in_progress")}
                      className="flex-1 md:flex-initial bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      Reject / Reopen
                    </button>
                  </>
                )}

                {snag.status === "verified" && (
                  <button
                    onClick={() => updateSnagStatus(snag.id, "open")}
                    className="flex-1 md:flex-initial bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Reopen Item
                  </button>
                )}

                <button
                  onClick={() => handleDeleteSnag(snag.id)}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 ml-auto md:ml-0"
                  title="Delete Snag"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* SOPHISTICATED PRINT-READY CLIENT EXPORT REPORT MODAL */}
      <AnimatePresence>
        {showClientReport && (
          <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto print:absolute print:inset-0 print:bg-white print:p-0 print:z-0">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-50 text-stone-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden print:shadow-none print:rounded-none print:max-h-none print:w-full"
            >
              {/* Modal Control Panel - Hidden during print */}
              <div className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white p-4 flex items-center justify-between border-b border-sky-900 print:hidden shrink-0">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-amber-500 animate-pulse" />
                  <div>
                    <span className="text-xs uppercase font-black tracking-wider text-amber-400">Client Presentation</span>
                    <h4 className="text-sm font-bold text-sky-50">Work-To-Complete Audit Report</h4>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-slate-900 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    {isDownloadingPdf ? "Downloading..." : "Download PDF"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-sky-900 hover:bg-sky-800 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    onClick={() => setShowClientReport(false)}
                    className="p-1.5 hover:bg-[#334486] rounded-lg text-sky-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* REPORT PAPER COMPONENT (Ink, Slate & Gold Accent Design) */}
              <div id="snaglist-audit-report-render" className="p-8 md:p-12 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible">
                {/* Print Styles Injector */}
                <style dangerouslySetInnerHTML={{ __html: `
                  @media print {
                    body {
                      background-color: white !important;
                      color: #1c1917 !important;
                    }
                    .print\\:hidden {
                      display: none !important;
                    }
                    .print\\:no-border {
                      border: none !important;
                    }
                  }
                `}} />

                <div className="max-w-3xl mx-auto space-y-8">
                  {/* Studio Identity Letterhead */}
                  <div className="flex justify-between items-start border-b border-stone-200 pb-6">
                    <div className="space-y-1">
                      <h1 className="text-xl font-bold tracking-tight text-stone-900 uppercase">
                        {projectContext.name || "FORM FACTORS DESIGN STUDIO"}
                      </h1>
                      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                        Architectural & Interior Design Verification Audit
                      </p>
                    </div>

                    <div className="text-right space-y-1 text-xs text-stone-500">
                      <p className="font-bold text-stone-900">Form Factors Operations</p>
                      <p>Snag List Audit Report</p>
                      <p>Date: {new Date().toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Elegant Thin Gold Accent Line (The single brand accent allowed by Design guidelines) */}
                  <div className="h-[2px] bg-[#d4af37] w-full" />

                  {/* Audit Metadata Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-stone-50 p-6 rounded-xl border border-stone-100 text-xs">
                    <div>
                      <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">Project</span>
                      <strong className="text-stone-800 font-bold text-sm block">
                        {projectContext.clientName || "Residential Project"}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">Audit Location</span>
                      <strong className="text-stone-800 font-bold text-sm block">
                        {projectContext.rooms ? `${projectContext.rooms.length} Audited Areas` : "Site-wide"}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">Pending Action</span>
                      <strong className="text-stone-800 font-bold text-sm block">
                        {stats.open + stats.inProgress} Defect Points
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">Quality Sign-off</span>
                      <strong className="text-stone-800 font-bold text-sm block">
                        {stats.total > 0 ? `${Math.round((stats.verified / stats.total) * 100)}% Resolved` : "100% Ready"}
                      </strong>
                    </div>
                  </div>

                  {/* Executive Summary Narrative */}
                  <div className="space-y-2 text-stone-800">
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-stone-500">Audit Intent & Scope</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      The following defect audit details outstanding items logged during our final walkthrough assessments. 
                      Our team and contractors are actively addressing open points to match <strong>Form Factors Design Studio</strong> rigorous quality standards before final handover and keys delivery.
                    </p>
                  </div>

                  {/* Dynamic Snags Table (Grouped by Room) */}
                  <div className="space-y-6">
                    {snags.length === 0 ? (
                      <div className="py-12 border border-dashed border-stone-200 text-center rounded-xl">
                        <p className="text-xs font-bold text-stone-400">No defects registered. Ready for final possession sign-off.</p>
                      </div>
                    ) : (
                      // Filter and render by location grouping
                      Array.from(new Set(snags.map(s => s.roomId))).map((roomId) => {
                        const roomSnags = snags.filter(s => s.roomId === roomId);
                        const roomName = roomSnags[0]?.roomName || "General Area";

                        return (
                          <div key={roomId} className="space-y-2">
                            {/* Grouping header */}
                            <h4 className="text-xs font-bold text-stone-900 border-b border-stone-200 pb-1 uppercase tracking-wide">
                              {roomName} ({roomSnags.length} audit points)
                            </h4>

                            {/* Group items table */}
                            <div className="overflow-hidden border border-stone-100 rounded-lg">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-100 text-[10px] uppercase tracking-wider">
                                  <tr>
                                    <th className="p-3 font-semibold w-1/12">No.</th>
                                    <th className="p-3 font-semibold w-6/12">Item & Defect Description</th>
                                    <th className="p-3 font-semibold w-2/12">Impact</th>
                                    <th className="p-3 font-semibold w-3/12">Current Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 text-stone-700">
                                  {roomSnags.map((snag, index) => (
                                    <tr key={snag.id} className="hover:bg-stone-50/50">
                                      <td className="p-3 align-top font-bold text-stone-400">#{index + 1}</td>
                                      <td className="p-3 align-top space-y-1">
                                        <p className="font-bold text-stone-900 text-xs">{snag.description}</p>
                                        {snag.notes && (
                                          <p className="text-[10px] text-stone-500 italic">
                                            Remarks: {snag.notes}
                                          </p>
                                        )}
                                        {snag.assignedTo && (
                                          <p className="text-[9px] text-stone-400 uppercase tracking-wider">
                                            Assigned: {snag.assignedTo}
                                          </p>
                                        )}
                                      </td>
                                      <td className="p-3 align-top">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                          snag.severity === "high" ? "text-red-700" : "text-stone-500"
                                        }`}>
                                          {snag.severity}
                                        </span>
                                      </td>
                                      <td className="p-3 align-top font-medium">
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${
                                          snag.status === "verified" ? "text-emerald-700" : snag.status === "resolved" ? "text-blue-700" : "text-stone-600"
                                        }`}>
                                          {snag.status.replace("_", " ")}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Formal Signature and Approval Block */}
                  <div className="pt-12 grid grid-cols-2 gap-12 text-xs border-t border-stone-200 mt-16">
                    <div className="space-y-12">
                      <p className="font-bold text-stone-800">For Form Factors Design Studio:</p>
                      <div className="border-t border-stone-300 pt-2 w-48 text-stone-400">
                        Authorized Audit Lead
                        <span className="block text-[10px] text-stone-300 mt-1">Date: ____ / ____ / ________</span>
                      </div>
                    </div>

                    <div className="space-y-12">
                      <p className="font-bold text-stone-800">Client / Assignee Sign-off:</p>
                      <div className="border-t border-stone-300 pt-2 w-48 text-stone-400">
                        Accepted / Handover Representative
                        <span className="block text-[10px] text-stone-300 mt-1">Date: ____ / ____ / ________</span>
                      </div>
                    </div>
                  </div>

                  {/* Handover Quality Statement */}
                  <div className="text-[10px] text-stone-400 text-center pt-8 border-t border-stone-100">
                    This document is a true quality verification ledger generated by Form Factors B2B Operations Suite. 
                    All signatures signify acceptance of addressed snags as defined in design service agreements.
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
