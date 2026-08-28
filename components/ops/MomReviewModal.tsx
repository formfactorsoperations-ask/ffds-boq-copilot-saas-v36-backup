import React, { useState, useRef } from "react";
import { prepareClonedDocForPdf } from "../../lib/pdfUtils";
import {
  MOM,
  MOMAttendee,
  MOMDecision,
  MOMActionItem,
  MOMNote,
} from "../../types";
import { db } from "../../services/firebaseClient";
import { updateDoc, doc } from "firebase/firestore";
import {
  X,
  Save,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  User as UserIcon,
  Download,
  Share2,
  Users,
  Gavel,
  ListTodo,
  StickyNote,
  Clock,
  ArrowRight,
  Sparkles,
  Send,
  FileText,
} from "lucide-react";
import { useOrg } from "../../contexts/OrgContext";
import { StudioDocumentShell } from "./documents/StudioDocumentShell";

interface MomReviewModalProps {
  mom: MOM;
  projectId: string;
  studioId: string;
  projectContextName?: string;
  onClose: () => void;
}

export function MomReviewModal({
  mom,
  projectId,
  studioId,
  projectContextName,
  onClose,
}: MomReviewModalProps) {
  const { currentRole, orgData } = useOrg();
  const isOwner = currentRole === "Admin" || currentRole === "Ops Director";
  const studioName = orgData?.orgName || "Studio";

  const [draft, setDraft] = useState<MOM>(() => {
    if (!mom) return {} as MOM;
    try {
      return JSON.parse(JSON.stringify(mom));
    } catch (e) {
      return {} as MOM;
    }
  });
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "attendees" | "decisions" | "actions" | "notes" | null
  >("actions");

  // Utility to update draft deep state selectively
  const updateDraft = (patch: Partial<MOM>) => setDraft({ ...draft, ...patch });

  const getOrCreateShareToken = async () => {
    let token = draft.shareToken;
    if (!token) {
      token = `mom_${Date.now()}`;
      setDraft((d) => ({ ...d, shareToken: token }));
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        { shareToken: token },
      );
    }
    return token;
  };

  const markShared = async () => {
    if (mom.status === "finalised") {
      const updates = { status: "shared", sharedAt: Date.now() };
      setDraft((d) => ({ ...d, ...updates }));
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        updates,
      );
    }
  };

  const handleShareWhatsApp = async () => {
    setSaving(true);
    await getOrCreateShareToken();
    await markShared();

    if (pdfContentRef.current) {
      try {
        const html2pdfModule = await import("html2pdf.js");
        let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
        if (html2pdfObj && html2pdfObj.default)
          html2pdfObj = html2pdfObj.default;

        if (typeof html2pdfObj !== "function") {
          throw new Error("html2pdf failed: could not resolve function");
        }

        const opt = {
          margin: 0,
          filename: `MoM_${draft.momRef}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        const pdfBlob = await html2pdfObj()
          .set(opt)
          .from(pdfContentRef.current)
          .outputPdf("blob");
        const file = new File([pdfBlob], `MoM_${draft.momRef}.pdf`, {
          type: "application/pdf",
        });

        const decisionsCount = draft.decisions?.length || 0;
        const actionsCount = draft.actionItems?.length || 0;
        const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease find the PDF attached to this message.`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.clipboard.writeText(txt);
          } catch (e) {
            console.error("Clipboard write failed", e);
          }
          await navigator.share({
            files: [file],
            title: `MoM - ${draft.meetingTitle}`,
            text: txt,
          });
        } else {
          // Fallback: Download the PDF and tell user to attach it manually
          await html2pdfObj().set(opt).from(pdfContentRef.current).save();
          window.open(
            `https://wa.me/?text=${encodeURIComponent(txt)}`,
            "_blank",
          );
        }
      } catch (e) {
        console.error("Share failed", e);
        // Fallback to old behavior
        const link = `${window.location.origin}/mom/${draft.shareToken}`;
        const decisionsCount = draft.decisions?.length || 0;
        const actionsCount = draft.actionItems?.length || 0;
        const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease review and acknowledge the minutes here:\n${link}\n\nThank you!`;
        window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
      }
    } else {
      const link = `${window.location.origin}/mom/${draft.shareToken}`;
      const decisionsCount = draft.decisions?.length || 0;
      const actionsCount = draft.actionItems?.length || 0;
      const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease review and acknowledge the minutes here:\n${link}\n\nThank you!`;
      window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
    }

    setSaving(false);
  };

  const handleCopyLink = async () => {
    setSaving(true);
    try {
      const token = await getOrCreateShareToken();
      const link = `${window.location.origin}/mom/${token}`;
      await navigator.clipboard.writeText(link);
      alert("Client signable link copied to clipboard!");
    } catch (e) {
      console.error(e);
      alert("Failed to copy link");
    } finally {
      setSaving(false);
    }
  };

  const pdfContentRef = useRef<HTMLDivElement>(null);

  if (!mom || !draft || !draft.id) {
    return null;
  }

  const handleDownloadPdf = async () => {
    setSaving(true);
    await getOrCreateShareToken();
    await markShared();

    if (pdfContentRef.current) {
      try {
        const html2pdfModule = await import("html2pdf.js");
        let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
        if (html2pdfObj && html2pdfObj.default)
          html2pdfObj = html2pdfObj.default;

        if (typeof html2pdfObj !== "function") {
          throw new Error("html2pdf failed: could not resolve function");
        }
        const opt = {
          margin: 0,
          filename: `MoM_${draft.momRef}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        await html2pdfObj().set(opt).from(pdfContentRef.current).save();
      } catch (e) {
        console.error(e);
        // fallback
        const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
        window.open(link, "_blank");
      }
    } else {
      // fallback
      const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
      window.open(link, "_blank");
    }
    setSaving(false);
  };

  const scopeCostCount = (draft.actionItems || []).filter(
    (a) => a.flags?.scope,
  ).length;

  const handleLogDecision = async (idx: number) => {
    const newD = [...draft.decisions];
    newD[idx].linkedDecisionId = `DEC-${Date.now()}`;
    await updateDoc(
      doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
      {
        decisions: newD,
      },
    );
    updateDraft({ decisions: newD });
    alert("Decision logged to project execution data!");
  };

  const handleCreateSA = async (idx: number) => {
    const nx = [...draft.actionItems];
    nx[idx].linkedScopeAdditionId = `SA-${Date.now()}`;
    await updateDoc(
      doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
      {
        actionItems: nx,
      },
    );
    updateDraft({ actionItems: nx });
    alert("Opened Scope Addition flow prefilled with: " + nx[idx].text);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        {
          ...draft,
          status: "draft",
        },
      );
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalise = async () => {
    setSaving(true);
    try {
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        {
          ...draft,
          status: "finalised",
        },
      );
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to finalise MoM");
    } finally {
      setSaving(false);
    }
  };

  const isFinalised =
    mom.status === "finalised" ||
    mom.status === "shared" ||
    mom.status === "acknowledged";

  return (
    <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 z-[100] flex items-center justify-center p-0 sm:p-4 backdrop-blur-xs font-sans">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[92vh] max-w-3xl flex flex-col overflow-hidden border border-slate-200/80">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-[#FAF9F6]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Review Minutes: {draft.momRef}
                <span className="h-1.5 w-1.5 rounded-full bg-[#B89047]"></span>
              </h2>
              {!isFinalised ? (
                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 border border-amber-200 rounded-md uppercase tracking-wider">
                  Draft — Review Phase
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-800 text-xs font-bold px-2.5 py-0.5 border border-emerald-200 rounded-md uppercase tracking-wider">
                  Finalized Protocol
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-semibold mt-1">{draft.meetingTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full p-2.5 hover:shadow-sm hover:bg-slate-50 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scope Risk Banner (Clean Navy/Gold highlights) */}
        {!isFinalised && scopeCostCount > 0 && (
          <div className="bg-amber-50/50 border-b border-amber-200/60 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900">
              <AlertTriangle size={15} className="text-[#B89047] shrink-0" />
              <p className="text-sm font-bold leading-relaxed text-slate-900/80">
                Notice: {scopeCostCount} item(s) flagged as potential scope expansions. Verify before final client share.
              </p>
            </div>
            <button
              onClick={() => setActiveSection("actions")}
              className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-3.5 py-2 rounded-lg hover:bg-amber-200 transition shrink-0"
            >
              Analyze Items
            </button>
          </div>
        )}

        {/* Content Section (Streamlined light-grey viewport) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-5">
          
          {/* 1. ATTENDEES ACCORDION */}
          <AccordionSection
            title={`Meeting Attendees (${draft.attendees?.length || 0})`}
            icon={<Users size={16} className="text-slate-400" />}
            isOpen={activeSection === "attendees"}
            onToggle={() =>
              setActiveSection(
                activeSection === "attendees" ? null : "attendees",
              )
            }
          >
            <div className="space-y-3">
              {draft.attendees?.map((att, idx) => (
                <div
                  key={idx}
                  className="flex gap-2.5 items-center bg-white border border-slate-200/80 rounded-xl p-2.5"
                >
                  <input
                    type="text"
                    disabled={isFinalised}
                    value={att.name}
                    placeholder="Attendee full name"
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].name = e.target.value;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="flex-1 bg-transparent px-2.5 py-1 text-sm text-slate-900 font-semibold outline-none placeholder-slate-400"
                  />
                  <select
                    disabled={isFinalised}
                    value={att.side}
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].side = e.target.value as any;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="bg-slate-50 border border-slate-200 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl outline-none text-slate-600 transition focus:bg-white"
                  >
                    <option value="client">Client</option>
                    <option value="ffds">{studioName}</option>
                    <option value="vendor">Vendor</option>
                    <option value="unknown">External</option>
                  </select>
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const newAtts = [...draft.attendees];
                        newAtts.splice(idx, 1);
                        updateDraft({ attendees: newAtts });
                      }}
                      className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      attendees: [
                        ...(draft.attendees || []),
                        { name: "", side: "unknown" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Attendee
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 2. DECISIONS ACCORDION */}
          <AccordionSection
            title={`Decisions Recorded (${draft.decisions?.length || 0})`}
            icon={<Gavel size={16} className="text-slate-400" />}
            isOpen={activeSection === "decisions"}
            onToggle={() =>
              setActiveSection(
                activeSection === "decisions" ? null : "decisions",
              )
            }
          >
            <div className="space-y-3.5">
              {draft.decisions?.map((d, idx) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-2.5 bg-white border border-slate-200/80 rounded-xl p-4"
                >
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle
                      size={16}
                      className="text-[#B89047] shrink-0 mt-1"
                    />
                    <textarea
                      disabled={isFinalised}
                      value={d.text}
                      placeholder="Enter recorded decision statement..."
                      onChange={(e) => {
                        const newD = [...draft.decisions];
                        newD[idx].text = e.target.value;
                        updateDraft({ decisions: newD });
                      }}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none resize-none min-h-[44px] leading-relaxed placeholder-slate-400"
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const newD = [...draft.decisions];
                          newD.splice(idx, 1);
                          updateDraft({ decisions: newD });
                        }}
                        className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isFinalised && (
                    <div className="pl-6 pt-2 border-t border-slate-100 flex">
                      {d.linkedDecisionId ? (
                        <span className="text-xs font-bold uppercase tracking-wider text-[#B89047] bg-amber-50/50 border border-[#B89047]/20 px-3 py-1.5 rounded">
                          ✓ Sync Active — Decision Logged
                        </span>
                      ) : (
                        <button
                          onClick={() => handleLogDecision(idx)}
                          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition flex items-center gap-1"
                        >
                          → Sync to Decisions Log
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      decisions: [
                        ...(draft.decisions || []),
                        { id: Date.now().toString(), text: "" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Decision
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 3. ACTION ITEMS ACCORDION */}
          <AccordionSection
            title={`Action Items & Milestones (${draft.actionItems?.length || 0})`}
            icon={<ListTodo size={16} className="text-slate-400" />}
            isOpen={activeSection === "actions"}
            onToggle={() =>
              setActiveSection(activeSection === "actions" ? null : "actions")
            }
          >
            <div className="space-y-4">
              {draft.actionItems?.map((a, idx) => (
                <div
                  key={a.id}
                  className="flex flex-col bg-white border border-slate-200/80 rounded-xl overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-100 flex gap-2.5">
                    <textarea
                      disabled={isFinalised}
                      value={a.text}
                      onChange={(e) => {
                        const nx = [...draft.actionItems];
                        nx[idx].text = e.target.value;
                        updateDraft({ actionItems: nx });
                      }}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none resize-none min-h-[44px] leading-relaxed placeholder-slate-400"
                      placeholder="Task description / target output..."
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const nx = [...draft.actionItems];
                          nx.splice(idx, 1);
                          updateDraft({ actionItems: nx });
                        }}
                        className="text-slate-300 hover:text-red-500 p-2 transition h-fit rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="p-4 bg-[#FAF9F6]/50 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3 items-center justify-between w-full">
                      <div className="flex flex-wrap gap-2.5 items-center">
                        <select
                          disabled={isFinalised}
                          value={a.owner}
                          onChange={(e) => {
                            const nx = [...draft.actionItems];
                            nx[idx].owner = e.target.value;
                            nx[idx].ownerName = e.target.value;
                            updateDraft({ actionItems: nx });
                          }}
                          className="text-xs bg-white border border-slate-200 rounded-lg py-2 px-3.5 font-bold uppercase tracking-wider text-slate-700 outline-none"
                        >
                          <option value="client">Client</option>
                          <option value="ffds">{studioName}</option>
                          <option value="vendor">Vendor</option>
                        </select>

                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                          <CalendarIcon size={12} className="text-slate-400" />
                          <input
                            type="date"
                            disabled={isFinalised}
                            value={
                              a.dueDate
                                ? new Date(a.dueDate)
                                    .toISOString()
                                    .split("T")[0]
                                : ""
                            }
                            onChange={(e) => {
                              const nx = [...draft.actionItems];
                              nx[idx].dueDate = e.target.value
                                ? new Date(e.target.value).getTime()
                                : undefined;
                              updateDraft({ actionItems: nx });
                            }}
                            className="text-xs font-bold bg-transparent border-none outline-none w-[120px] text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {isOwner ? (
                          <>
                            <button
                              onClick={() => {
                                if (isFinalised) return;
                                const nx = [...draft.actionItems];
                                nx[idx] = {
                                  ...nx[idx],
                                  flags: {
                                    ...nx[idx].flags,
                                    scope: !nx[idx].flags?.scope,
                                  },
                                };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-xs px-3 py-1.5 rounded-md border font-bold uppercase tracking-wider transition ${a.flags?.scope ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-slate-400 border-slate-200 opacity-60 hover:opacity-100"}`}
                            >
                              Scope Impact
                            </button>
                          </>
                        ) : (
                          <>
                            {a.flags?.scope && (
                              <span className="text-xs px-3 py-1.5 rounded-md font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
                                Scope Impact
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isFinalised && a.flags?.scope && (
                      <div className="flex flex-wrap gap-3 border-t border-slate-200/50 pt-3 mt-1">
                        {a.linkedScopeAdditionId ? (
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded">
                            ✓ Scope Addition Linked
                          </span>
                        ) : (
                          isOwner && (
                            <button
                              onClick={() => handleCreateSA(idx)}
                              className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-[#B89047] transition flex items-center gap-1"
                            >
                              → Initiate Scope Addition Draft
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      actionItems: [
                        ...(draft.actionItems || []),
                        {
                          id: Date.now().toString(),
                          text: "",
                          owner: "ffds",
                          status: "open",
                          flags: {},
                        },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Action Item
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 4. NOTES ACCORDION */}
          <AccordionSection
            title={`Discussion Notes & References (${draft.notes?.length || 0})`}
            icon={<StickyNote size={16} className="text-slate-400" />}
            isOpen={activeSection === "notes"}
            onToggle={() =>
              setActiveSection(activeSection === "notes" ? null : "notes")
            }
          >
            <div className="space-y-3.5">
              {draft.notes?.map((n, idx) => (
                <div
                  key={n.id}
                  className="flex gap-2.5 items-start bg-transparent border-none p-0"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B89047] mt-2 shrink-0"></div>
                  <textarea
                    disabled={isFinalised}
                    value={n.text}
                    placeholder="Enter discussion bullet..."
                    onChange={(e) => {
                      const nx = [...draft.notes];
                      nx[idx].text = e.target.value;
                      updateDraft({ notes: nx });
                    }}
                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none resize-none min-h-[40px] leading-relaxed placeholder-slate-400 font-semibold"
                  />
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const nx = [...draft.notes];
                        nx.splice(idx, 1);
                        updateDraft({ notes: nx });
                      }}
                      className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      notes: [
                        ...(draft.notes || []),
                        { id: Date.now().toString(), text: "" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Note
                </button>
              )}
            </div>
          </AccordionSection>
        </div>

        {/* Footer (Actions Bar) */}
        {!isFinalised ? (
          <div className="p-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex-1 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-slate-100/80 transition shadow-sm"
            >
              Save Progress
            </button>
            <button
              onClick={handleFinalise}
              disabled={saving}
              className="flex-1 py-3 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:text-amber-400 rounded-xl font-bold text-sm uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle2 size={14} />
              Finalise Document
            </button>
          </div>
        ) : (
          <div className="p-6 border-t border-slate-200 bg-[#FAF9F6] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 tracking-tight text-sm uppercase">
                  Share & Sign Protocol
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Distribute the finalized Minutes of Meeting via WhatsApp or download as a PDF document.
                </p>
              </div>
              {mom.status === "acknowledged" && (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                  <CheckCircle size={11} /> Client Signed
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleShareWhatsApp}
                disabled={saving}
                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm uppercase tracking-wider transition shadow-sm"
              >
                <Send size={14} />
                WhatsApp Share
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={saving}
                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-slate-100 transition shadow-sm"
              >
                <Download size={14} />
                Download PDF
              </button>
              <button
                onClick={handleCopyLink}
                disabled={saving}
                className="flex w-14 justify-center items-center py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition shadow-sm"
                title="Copy Client Share Link"
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden printable content for PDF generation (Sober, Print-first Theme) */}
      <div className="absolute left-[-9999px] top-[-9999px]">
        <div ref={pdfContentRef} className="w-[210mm] bg-white text-slate-900">
          {orgData && (
            <StudioDocumentShell
              orgData={orgData}
              docHeaderType={`Minutes of Meeting\nRef: ${mom.momRef}`}
              docHeaderTitle={mom.meetingTitle || "Minutes of Meeting"}
            >
              <div className="space-y-8 text-sm text-slate-900 pt-4 font-sans pb-12">
                {/* 1. Protocol Metadata Box */}
                <div className="border border-[#d9d6cc] bg-[#FAF9F6] p-5">
                  <div className="grid grid-cols-2 gap-y-4 text-xs">
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Reference Number</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">{mom.momRef}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Meeting Date</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">
                        {mom.meetingDate ? new Date(mom.meetingDate).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Project Name</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">{projectContextName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Meeting Type</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm uppercase tracking-wider">
                        {(mom.meetingType as string) === "internal" 
                          ? "Internal Team Review" 
                          : (mom.meetingType as string) === "vendor" 
                            ? "Vendor Coordination" 
                            : (mom.meetingType as string) === "client" 
                              ? "Client Alignment" 
                              : "Site Coordination"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Single Gold Hairline Accent divider */}
                <div className="h-[1px] bg-[#B89047]" />

                {/* 2. Attendees Section */}
                <div>
                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                    <Users size={14} className="text-[#B89047]" />
                    Attendees
                  </h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-slate-100 pt-3">
                    {mom.attendees?.map((a, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100/60">
                        <span className="font-bold text-slate-800">{a.name}</span>
                        <span className="text-[#666666] font-bold uppercase tracking-wider">
                          {a.side === "ffds" ? studioName : "Client"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Decisions Section */}
                {mom.decisions && mom.decisions.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <Gavel size={14} className="text-[#B89047]" />
                      Decisions Logged
                    </h3>
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      {mom.decisions.map((d, i) => (
                        <div key={i} className="flex gap-3 items-start text-xs leading-relaxed text-[#1E1B4B]">
                          <span className="text-[#B89047] font-extrabold select-none mt-0.5">▪</span>
                          <span className="font-medium text-slate-800">{d.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Action Items Section */}
                {mom.actionItems && mom.actionItems.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <ListTodo size={14} className="text-[#B89047]" />
                      Action Items & Tasks
                    </h3>
                    <div className="border-t border-slate-100 pt-3">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#FAF9F6] bg-[#FAF9F6]">
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-16 text-center">
                              Ref
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500">
                              Task Description
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-28 text-center">
                              Owner
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-28 text-right">
                              Due Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mom.actionItems.map((a, i) => (
                            <tr key={a.id} className="text-xs">
                              <td className="py-3 px-3 font-bold text-slate-400 text-center">
                                A-{String(i + 1).padStart(2, "0")}
                              </td>
                              <td className="py-3 px-3 font-medium text-slate-800 leading-relaxed">
                                {a.text}
                                {a.flags?.scope && (
                                  <span className="ml-2 inline-block text-[9px] text-red-600 font-bold uppercase tracking-wider">
                                    [Scope Update]
                                  </span>
                                )}
                                {a.flags?.cost && (
                                  <span className="ml-2 inline-block text-[9px] text-red-600 font-bold uppercase tracking-wider">
                                    [Cost Impact]
                                  </span>
                                )}
                                {a.flags?.drawing && (
                                  <span className="ml-2 inline-block text-[9px] text-[#0055B3] font-bold uppercase tracking-wider">
                                    [Drawing Keyed]
                                  </span>
                                )}
                                {a.flags?.siteCondition && (
                                  <span className="ml-2 inline-block text-[9px] text-amber-700 font-bold uppercase tracking-wider">
                                    [Site Check]
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-600 font-bold uppercase tracking-wider">
                                {a.owner === "ffds" ? studioName : "Client"}
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-600">
                                {a.dueDate ? (
                                  new Date(a.dueDate).toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                ) : (
                                  <span className="text-slate-300 italic">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. Discussion Notes Section */}
                {mom.notes && mom.notes.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <StickyNote size={14} className="text-[#B89047]" />
                      Discussion Notes
                    </h3>
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      {mom.notes.map((n, i) => (
                        <div key={n.id} className="flex gap-3 items-start text-xs leading-relaxed text-slate-700">
                          <span className="text-slate-300 font-bold select-none mt-0.5">•</span>
                          <span className="font-medium">{n.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Acknowledgment & Signature Block */}
                <div className="h-[1px] bg-slate-200 mt-8" />
                <div className="grid grid-cols-2 gap-12 pt-6">
                  <div className="space-y-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                      PREPARED BY
                    </span>
                    <div className="text-xs">
                      <p className="font-bold text-[#1E1B4B]">{studioName}</p>
                      <p className="text-[#666666] mt-1">Project Operations & Delivery</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-right">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                      CLIENT APPROVAL
                    </span>
                    {mom.status === "acknowledged" ? (
                      <div className="text-xs">
                        <p className="font-bold text-emerald-800">✓ Approved & Signed</p>
                        <p className="text-slate-600 mt-1">By {mom.acknowledgedBy}</p>
                        <p className="text-slate-500 text-[10px] mt-0.5">
                          {new Date(mom.acknowledgedAt!).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })} ({mom.ackChannel})
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-300 italic">
                        Pending Digital Acknowledgment via Client Portal
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </StudioDocumentShell>
          )}
        </div>
      </div>
    </div>
  );
}

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({ title, icon, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition-all">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex justify-between items-center bg-white hover:bg-slate-50/50 transition duration-150"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-extrabold text-slate-900 tracking-wider text-sm uppercase">
            {title}
          </h3>
        </div>
        <span
          className={`text-slate-400 text-xs transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-[#FAF9F6]/20">
          {children}
        </div>
      )}
    </div>
  );
}
