import React, { useState, useEffect, useMemo } from "react";
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
  ListChecks,
} from '@/lib/lucide-shim';
import { MomReviewModal } from "./MomReviewModal";
import { MomCaptureModal } from "./MomCaptureModal";
import { useOrg } from "../../contexts/OrgContext";
import { createEmptyMoM, createMoMFromNotes } from "../../services/momService";
import { setActionDone } from "../../services/minutesService";
import { opsSettingsOf } from "../../lib/opsDesk";
import { CountUp, Dot } from "../ui/HudBits";
import {
  trackedActions, minutesStateLabel, audienceOf, statusChip, fmtShortDay, clientContactOf, AUDIENCE_LABEL,
  type ActionLane, type ChipTone,
} from "../../lib/minutes";
import "../projectHeader/projectHeader.css";

/*
  MINUTES AND ACTIONS, for one project.

  Actions from every issued minutes, grouped by who they wait on: the
  studio, the client, a vendor. Each says which kind of meeting it came from
  and where its minutes stand -- a client confirming the minutes agrees with
  the record, it does not do the actions, so an action stays here until
  someone ticks it done.
*/

const TAG: Record<ChipTone, string> = {
  brand: "bg-[#3D52A0]/10 text-[#3D52A0]",
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};
const Tag: React.FC<{ tone: ChipTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TAG[tone]}`}>{children}</span>
);

const OLD_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "slate" }, pending_review: { label: "With a lead", tone: "amber" }, finalised: { label: "Finalised", tone: "brand" },
  shared: { label: "Waiting for client", tone: "amber" }, acknowledged: { label: "Confirmed", tone: "emerald" }, correction_requested: { label: "Correction asked", tone: "rose" },
};
const chipOf = (m: any): { label: string; tone: ChipTone } => (m?.format === 2 ? statusChip(m) : OLD_STATUS[String(m?.status)] || OLD_STATUS.draft);

interface MomActionTrackerProps {
  projectId: string;
  studioId: string;
  projectContextName?: string;
  /** The project, for the client's contacts and the stage new minutes start in. */
  projectContext?: any;
  onOpenMom?: (momId: string) => void;
}

export function MomActionTracker({
  projectId,
  studioId,
  projectContextName,
  projectContext,
  onOpenMom,
}: MomActionTrackerProps) {
  const { orgData } = useOrg();
  const newFlow = opsSettingsOf(orgData).newMinutes;
  const [moms, setMoms] = useState<MOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"actions" | "history">("actions");
  const [filter, setFilter] = useState<"all" | "open" | "overdue" | "client" | "studio" | "vendor" | "done">("open");
  const [writing, setWriting] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const tick = async (mom: any, actionId: string, done: boolean, key: string) => {
    if (!mom) return;
    setTicking(key);
    setError(null);
    try {
      await setActionDone(studioId, projectId, mom, actionId, done, { email: String(currentUser?.email || "").toLowerCase() });
    } catch (e: any) {
      setError(e?.code === "permission-denied" ? "You cannot change actions on these minutes." : "That did not save. Check your connection and try again.");
    } finally {
      setTicking(null);
    }
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

  /* Every action on issued minutes, with who it waits on (lib/minutes trackedActions). */
  const tracked = useMemo(() => trackedActions(moms as any[]), [moms]);
  const open = tracked.filter((a) => !a.done);
  const counts = {
    studio: open.filter((a) => a.lane === "studio").length,
    studioOverdue: open.filter((a) => a.lane === "studio" && a.overdue).length,
    client: open.filter((a) => a.lane === "client").length,
    clientOverdue: open.filter((a) => a.lane === "client" && a.overdue).length,
    vendor: open.filter((a) => a.lane === "vendor").length,
    overdue: open.filter((a) => a.overdue).length,
    done: tracked.length - open.length,
  };
  const toConfirm = moms.filter((m: any) => m.status === "shared" || m.status === "correction_requested").length;
  const corrections = moms.filter((m: any) => m.status === "correction_requested").length;
  const draftMomsCount = moms.filter((m) => m.status === "draft").length;

  const shown = tracked.filter((a) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (![a.text, a.ownerName, a.momRef, a.meeting].some((x) => x.toLowerCase().includes(q))) return false;
    }
    switch (filter) {
      case "open": return !a.done;
      case "studio": return !a.done && a.lane === "studio";
      case "client": return !a.done && a.lane === "client";
      case "vendor": return !a.done && a.lane === "vendor";
      case "overdue": return a.overdue;
      case "done": return a.done;
      default: return true;
    }
  });
  const LANES: { id: ActionLane; label: string }[] = [
    { id: "studio", label: "On the studio" },
    { id: "client", label: "Waiting on the client" },
    { id: "vendor", label: "With vendors" },
  ];
  const grouped = LANES.map((l) => ({ ...l, rows: shown.filter((a) => a.lane === l.id) })).filter((g) => g.rows.length);

  const tiles: { id: typeof filter; label: string; value: number; sub: string; tone: "bad" | "warn" | "ok" }[] = [
    { id: "studio", label: "On the studio", value: counts.studio, sub: counts.studioOverdue ? `${counts.studioOverdue} overdue` : counts.studio ? "Nothing overdue" : "Nothing waiting on the studio", tone: counts.studioOverdue ? "bad" : counts.studio ? "warn" : "ok" },
    { id: "client", label: "Waiting on the client", value: counts.client, sub: counts.clientOverdue ? `${counts.clientOverdue} overdue` : counts.client ? "Nothing overdue" : "Nothing waiting on the client", tone: counts.clientOverdue ? "bad" : counts.client ? "warn" : "ok" },
    { id: "overdue", label: "Overdue", value: counts.overdue, sub: counts.overdue ? "Past their date and still open" : "Everything is on time", tone: counts.overdue ? "bad" : "ok" },
    { id: "open", label: "Minutes to confirm", value: toConfirm, sub: corrections ? `${corrections} with a correction asked` : toConfirm ? "Sent, not confirmed yet" : "Every sent minutes is confirmed", tone: corrections ? "bad" : toConfirm ? "warn" : "ok" },
  ];

  const segBtn = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative min-h-[550px] flex flex-col hud-panel-in">
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><ListChecks className="w-4 h-4" /></span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800">Minutes and actions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Who owes what from every meeting. Confirming the minutes means the client agrees with the record; each action stays here until someone ticks it done.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={viewMode === "actions"} className={segBtn(viewMode === "actions")} onClick={() => setViewMode("actions")}>Actions</button>
            <button type="button" role="tab" aria-selected={viewMode === "history"} className={segBtn(viewMode === "history")} onClick={() => setViewMode("history")}>
              Minutes{draftMomsCount ? ` · ${draftMomsCount} draft${draftMomsCount === 1 ? "" : "s"}` : ""}
            </button>
          </div>
          <button type="button" onClick={() => (newFlow ? setWriting(true) : setShowCreateModal(true))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
            <Plus className="w-4 h-4" />Record meeting
          </button>
        </div>
      </div>

      {viewMode === "actions" ? (
        <div key="actions" className="hud-swap flex-1 flex flex-col">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5 sm:p-6 pb-0 sm:pb-0">
            {tiles.map((t, i) => (
              <button key={t.label} type="button" onClick={() => { setFilter(t.id); if (t.label === "Minutes to confirm") setViewMode("history"); }}
                className={`text-left rounded-2xl border bg-white p-4 hud-row-in transition-colors ${filter === t.id && t.label !== "Minutes to confirm" ? "border-[#3D52A0] ring-1 ring-[#3D52A0]/30" : "border-slate-200 hover:bg-slate-50"}`}
                style={{ animationDelay: `${i * 30}ms` }}>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Dot tone={t.tone} />{t.label}</span>
                <CountUp value={t.value} className="block text-2xl font-black text-slate-800 tabular-nums mt-1.5" />
                <span className="block text-[11px] text-slate-500 mt-0.5">{t.sub}</span>
              </button>
            ))}
          </div>

          <div className="px-5 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 self-start" role="tablist" aria-label="Which actions">
              {([
                ["open", `Open · ${open.length}`],
                ["studio", `On the studio · ${counts.studio}`],
                ["client", `On the client · ${counts.client}`],
                ...(counts.vendor ? [["vendor", `Vendors · ${counts.vendor}`]] : []),
                ["overdue", `Overdue · ${counts.overdue}`],
                ["done", `Done · ${counts.done}`],
              ] as [typeof filter, string][]).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={filter === id} className={segBtn(filter === id)} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search actions, people, refs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search actions"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
            </div>
          </div>

          <div className="flex-1 px-5 sm:px-6 pb-6 space-y-5">
            {loading ? (
              <p className="text-xs text-slate-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading the minutes…</p>
            ) : !grouped.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-800 mt-2">{filter === "done" ? "Nothing ticked done yet" : "Nothing waiting here"}</p>
                <p className="text-xs text-slate-500 mt-1">{searchQuery ? "No action matches the search." : "Actions from sent minutes show here until someone ticks them done."}</p>
              </div>
            ) : grouped.map((g) => (
              <section key={g.id}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{g.label} · {g.rows.length}</p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {g.rows.map((a, i) => {
                    const m = moms.find((x) => x.id === a.momId) as any;
                    const state = minutesStateLabel(a.momStatus, a.from);
                    const key = `${a.momId}:${a.actionId}`;
                    return (
                      <div key={key} className="grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_150px_220px] gap-x-3 md:gap-x-4 gap-y-2 px-3 py-3 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                        <button type="button" disabled={ticking === key} onClick={() => tick(m, a.actionId, !a.done, key)}
                          aria-label={a.done ? `Open again: ${a.text}` : `Mark done: ${a.text}`} title={a.done ? "Open again" : "Mark done"}
                          className="w-9 h-9 rounded-lg grid place-items-center hover:bg-slate-100 self-start shrink-0">
                          {ticking === key ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : a.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
                        </button>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${a.done ? "line-through text-slate-400" : "text-slate-800"}`}>{a.text}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-xs text-slate-500">{a.ownerName}</span>
                            <Tag tone={a.from === "client" ? "brand" : "slate"}>{AUDIENCE_LABEL[a.from]}</Tag>
                            {a.flags?.scope && <Tag tone="rose">Scope</Tag>}
                            {a.flags?.cost && <Tag tone="rose">Cost</Tag>}
                            {a.flags?.siteCondition && <Tag tone="amber">Site issue</Tag>}
                          </div>
                        </div>
                        <div className="col-start-2 md:col-start-auto text-xs md:pt-2">
                          {a.due ? (
                            <span className={`inline-flex items-center gap-1.5 font-semibold ${a.overdue ? "text-rose-700" : "text-slate-700"}`}>
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />{fmtShortDay(a.due)}{a.overdue ? " · overdue" : ""}
                            </span>
                          ) : <span className="text-slate-400">No date</span>}
                        </div>
                        <div className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-2 md:justify-end md:pt-1">
                          <div className="min-w-0 md:text-right">
                            <button type="button" onClick={() => setSelectedMomId(a.momId)} className="inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:text-[#334486]">
                              <ExternalLink className="w-3 h-3" />{a.momRef || "Minutes"}
                            </button>
                            <span className="block mt-0.5"><Tag tone={state.tone}>{state.label}</Tag></span>
                          </div>
                          {!a.done && a.lane === "client" && (
                            <a href={`https://wa.me/?text=${encodeURIComponent(`A gentle reminder from our meeting on ${new Date(a.meetingDate).toLocaleDateString("en-GB")} (${a.momRef}):\n\n${a.text}${a.due ? `\nDue ${fmtShortDay(a.due)}` : ""}\n\nThank you!`)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50">
                              <MessageCircle className="w-3.5 h-3.5" />Nudge
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
          </div>
        </div>
      ) : (
        <div key="history" className="hud-swap flex-1 p-5 sm:p-6">
          {moms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
              <FileText className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 mt-2">No minutes yet</p>
              <p className="text-xs text-slate-500 mt-1">Record your first meeting to start the list.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {moms.map((mom: any, i) => {
                const chip = chipOf(mom);
                const acts = (mom.actionItems || []).filter((a: any) => a.status !== "cancelled");
                const openActs = acts.filter((a: any) => a.status !== "done").length;
                return (
                  <div key={mom.id} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-4 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{mom.meetingTitle || "Meeting"}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {mom.momRef}{mom.rev ? ` · revision ${mom.rev + 1}` : ""} · {mom.meetingDate ? fmtShortDay(Number(mom.meetingDate)) : ""}
                        </p>
                      </div>
                      <Tag tone={chip.tone}>{chip.label}</Tag>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Tag tone={audienceOf(mom.meetingType) === "client" ? "brand" : "slate"}>{AUDIENCE_LABEL[audienceOf(mom.meetingType)]}</Tag>
                      {mom.format !== 2 && <Tag tone="slate">Earlier format</Tag>}
                    </div>
                    <div className="grid grid-cols-3 rounded-xl border border-slate-200 divide-x divide-slate-100 text-center">
                      {([["Decisions", (mom.decisions || []).length], ["Actions", acts.length], ["Still open", openActs]] as [string, number][]).map(([k, v]) => (
                        <div key={k} className="py-2">
                          <p className={`text-base font-black tabular-nums ${k === "Still open" && v ? "text-amber-700" : "text-slate-800"}`}>{v}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button type="button" onClick={() => setSelectedMomId(mom.id)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3D52A0] hover:text-[#334486]">
                        <ExternalLink className="w-3.5 h-3.5" />{mom.status === "draft" ? "Carry on writing" : "Open the minutes"}
                      </button>
                      <button type="button" onClick={() => deleteMom(mom.id)} className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100" title="Delete these minutes" aria-label={`Delete ${mom.momRef}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
          client={projectContext ? clientContactOf(projectContext) : undefined}
          onClose={() => setSelectedMomId(null)}
        />
      )}

      {writing && (
        <MomCaptureModal
          visit={{ id: `ops-${Date.now()}`, type: "client_meeting", title: "", date: Date.now(), notes: "", attendees: projectContext?.clientName ? [projectContext.clientName] : [], phaseStepNumber: Number(projectContext?.currentPhaseStep) || 0 } as any}
          projectId={projectId} studioId={studioId} projectContextName={projectContextName || "Project"}
          onClose={() => setWriting(false)}
          onSuccess={(momId) => { setWriting(false); setSelectedMomId(momId); }}
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
