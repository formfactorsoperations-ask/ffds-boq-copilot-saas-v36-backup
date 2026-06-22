import React, { useState, useRef } from "react";
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
  Share2
} from "lucide-react";
import { useOrg } from "../../contexts/OrgContext";
import { StudioDocumentShell } from "./documents/StudioDocumentShell";

interface MomReviewModalProps {
  mom: MOM;
  projectId: string;
  studioId: string;
  onClose: () => void;
}

export function MomReviewModal({
  mom,
  projectId,
  studioId,
  onClose,
}: MomReviewModalProps) {
  const { currentRole, orgData } = useOrg();
  const isOwner = currentRole === "Admin" || currentRole === "Ops Director";

  const [draft, setDraft] = useState<MOM>(JSON.parse(JSON.stringify(mom)));
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
          setDraft(d => ({ ...d, shareToken: token }));
          await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), { shareToken: token });
      }
      return token;
  };

  const markShared = async () => {
      if (mom.status === 'finalised') {
          const updates = { status: 'shared', sharedAt: Date.now() };
          setDraft(d => ({ ...d, ...updates }));
          await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), updates);
      }
  };

  const handleShareWhatsApp = async () => {
      setSaving(true);
      const token = await getOrCreateShareToken();
      await markShared();
      const link = `${window.location.origin}/mom/${token}`;
      const decisionsCount = draft.decisions?.length || 0;
      const actionsCount = draft.actionItems?.length || 0;
      const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease review and acknowledge the minutes here:\n${link}\n\nThank you!`;
      
      setSaving(false);
      window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  const handleCopyLink = async () => {
      setSaving(true);
      const token = await getOrCreateShareToken();
      await markShared();
      const link = `${window.location.origin}/mom/${token}`;
      await navigator.clipboard.writeText(link);
      alert("Link copied to clipboard!");
      setSaving(false);
  };

  const pdfContentRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
      setSaving(true);
      await getOrCreateShareToken();
      if (pdfContentRef.current) {
          try {
              const html2pdfModule = await import('html2pdf.js');
              let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
              if (html2pdfObj && html2pdfObj.default) html2pdfObj = html2pdfObj.default;
              
              if (typeof html2pdfObj !== 'function') {
                  throw new Error("html2pdf failed: could not resolve function");
              }
              const opt = {
                  margin: 0,
                  filename: `MoM_${draft.momRef}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
              };
              await html2pdfObj().set(opt).from(pdfContentRef.current).save();
          } catch (e) {
              console.error(e);
              // fallback
              const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
              window.open(link, '_blank');
          }
      } else {
          // fallback
          const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
          window.open(link, '_blank');
      }
      setSaving(false);
  };


  const scopeCostCount = (draft.actionItems || []).filter(
    (a) => a.flags?.cost || a.flags?.scope,
  ).length;

  const handleLogDecision = async (idx: number) => {
    // Mock linkage
    const newD = [...draft.decisions];
    newD[idx].linkedDecisionId = `DEC-${Date.now()}`;
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), {
       decisions: newD
    });
    updateDraft({ decisions: newD });
    alert("Decision logged to project execution data!");
  };

  const handleCreateSA = async (idx: number) => {
    // Mock linkage
    const nx = [...draft.actionItems];
    nx[idx].linkedScopeAdditionId = `SA-${Date.now()}`;
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), {
       actionItems: nx
    });
    updateDraft({ actionItems: nx });
    alert("Opened Scope Addition flow prefilled with: " + nx[idx].text);
  };

  const handleCreateDrawing = async (idx: number) => {
    // Mock linkage
    const nx = [...draft.actionItems];
    nx[idx].linkedDrawingId = `REV-${Date.now()}`;
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), {
       actionItems: nx
    });
    updateDraft({ actionItems: nx });
    alert("Logged to Drawing Tracker!");
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
    <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] max-w-3xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-[#f1f5f9]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Review MoM: {draft.momRef}
              </h2>
              {!isFinalised && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide">
                  Draft — review before sharing
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">{draft.meetingTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-white rounded-full p-2 shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scope Banner */}
        {!isFinalised && scopeCostCount > 0 && (
          <div className="bg-rose-50 border-b border-rose-100 px-4 py-3 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 text-rose-800">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <p className="text-sm font-semibold">
                ⚠ {scopeCostCount} item(s) may affect cost or scope — review
                before sharing
              </p>
            </div>
            <button
              onClick={() => setActiveSection("actions")}
              className="text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-1 rounded hover:bg-rose-200 transition"
            >
              View items
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-4">
          {/* Sections implementation to follow... */}
          <AccordionSection
            title={`Attendees (${draft.attendees?.length || 0})`}
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
                  className="flex gap-2 items-center bg-white border border-slate-200 rounded-lg p-2"
                >
                  <input
                    type="text"
                    disabled={isFinalised}
                    value={att.name}
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].name = e.target.value;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="flex-1 bg-transparent px-2 py-1 text-sm outline-none"
                  />
                  <select
                    disabled={isFinalised}
                    value={att.side}
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].side = e.target.value as any;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="bg-slate-50 text-xs px-2 py-1 rounded border-none outline-none"
                  >
                    <option value="client">Client</option>
                    <option value="ffds">FFDS</option>
                    <option value="vendor">Vendor</option>
                    <option value="unknown">Unknown</option>
                  </select>
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const newAtts = [...draft.attendees];
                        newAtts.splice(idx, 1);
                        updateDraft({ attendees: newAtts });
                      }}
                      className="text-slate-400 hover:text-red-500 p-1"
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
                  className="text-sm text-[#1e3a8a] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={14} /> Add Attendee
                </button>
              )}
            </div>
          </AccordionSection>

          <AccordionSection
            title={`Decisions (${draft.decisions?.length || 0})`}
            isOpen={activeSection === "decisions"}
            onToggle={() =>
              setActiveSection(
                activeSection === "decisions" ? null : "decisions",
              )
            }
          >
            <div className="space-y-3">
              {draft.decisions?.map((d, idx) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-2 bg-white border border-slate-200 rounded-lg p-3"
                >
                  <div className="flex gap-2 items-start">
                    <CheckCircle
                      size={16}
                      className="text-emerald-500 shrink-0 mt-0.5"
                    />
                    <textarea
                      disabled={isFinalised}
                      value={d.text}
                      onChange={(e) => {
                        const newD = [...draft.decisions];
                        newD[idx].text = e.target.value;
                        updateDraft({ decisions: newD });
                      }}
                      className="flex-1 bg-transparent text-sm outline-none resize-none min-h-[40px] leading-relaxed"
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const newD = [...draft.decisions];
                          newD.splice(idx, 1);
                          updateDraft({ decisions: newD });
                        }}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isFinalised && (
                    <div className="pl-6 flex">
                       {d.linkedDecisionId ? (
                         <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-sm">→ Decision Logged</span>
                       ) : (
                         <button onClick={() => handleLogDecision(idx)} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 transition">→ Log Decision</button>
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
                  className="text-sm text-[#1e3a8a] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={14} /> Add Decision
                </button>
              )}
            </div>
          </AccordionSection>

          <AccordionSection
            title={`Action Items (${draft.actionItems?.length || 0})`}
            isOpen={activeSection === "actions"}
            onToggle={() =>
              setActiveSection(activeSection === "actions" ? null : "actions")
            }
          >
            <div className="space-y-4">
              {draft.actionItems?.map((a, idx) => (
                <div
                  key={a.id}
                  className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-50 flex gap-2">
                    <textarea
                      disabled={isFinalised}
                      value={a.text}
                      onChange={(e) => {
                        const nx = [...draft.actionItems];
                        nx[idx].text = e.target.value;
                        updateDraft({ actionItems: nx });
                      }}
                      className="flex-1 bg-transparent text-sm font-medium outline-none resize-none min-h-[40px]"
                      placeholder="Task description..."
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const nx = [...draft.actionItems];
                          nx.splice(idx, 1);
                          updateDraft({ actionItems: nx });
                        }}
                        className="text-slate-400 hover:text-red-500 p-1 h-fit"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3 items-center justify-between w-full">
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          disabled={isFinalised}
                          value={a.owner}
                          onChange={(e) => {
                            const nx = [...draft.actionItems];
                            nx[idx].owner = e.target.value;
                            nx[idx].ownerName = e.target.value; // simplistic
                            updateDraft({ actionItems: nx });
                          }}
                          className="text-xs bg-white border border-slate-200 rounded-md py-1 px-2 font-medium text-slate-700"
                        >
                          <option value="client">Client</option>
                          <option value="ffds">FFDS</option>
                          <option value="vendor">Vendor</option>
                        </select>

                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1">
                          <CalendarIcon size={12} className="text-slate-400" />
                          <input
                            type="date"
                            disabled={isFinalised}
                            value={
                              a.dueDate
                                ? new Date(a.dueDate).toISOString().split("T")[0]
                                : ""
                            }
                            onChange={(e) => {
                              const nx = [...draft.actionItems];
                              nx[idx].dueDate = e.target.value
                                ? new Date(e.target.value).getTime()
                                : undefined;
                              updateDraft({ actionItems: nx });
                            }}
                            className="text-xs bg-transparent border-none outline-none w-[100px] text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="flex gap-1.5 flex-wrap">
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
                                    scope: !nx[idx].flags.scope,
                                  },
                                };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition ${a.flags?.scope ? "bg-red-100 text-red-700 border border-red-200 border-dashed" : "bg-slate-100 text-slate-400 opacity-50 hover:opacity-100"}`}
                            >
                              Scope
                            </button>
                            <button
                              onClick={() => {
                                if (isFinalised) return;
                                const nx = [...draft.actionItems];
                                nx[idx] = {
                                  ...nx[idx],
                                  flags: {
                                    ...nx[idx].flags,
                                    cost: !nx[idx].flags.cost,
                                  },
                                };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition ${a.flags?.cost ? "bg-amber-100 text-amber-700 border border-amber-200 border-dashed" : "bg-slate-100 text-slate-400 opacity-50 hover:opacity-100"}`}
                            >
                              Cost
                            </button>
                            <button
                              onClick={() => {
                                if (isFinalised) return;
                                const nx = [...draft.actionItems];
                                nx[idx] = {
                                  ...nx[idx],
                                  flags: {
                                    ...nx[idx].flags,
                                    drawing: !nx[idx].flags.drawing,
                                  },
                                };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition ${a.flags?.drawing ? "bg-blue-100 text-blue-700 border border-blue-200 border-dashed" : "bg-slate-100 text-slate-400 opacity-50 hover:opacity-100"}`}
                            >
                              Drawing
                            </button>
                          </>
                        ) : (
                          // Designers only see flags if they are true, can't edit
                          <>
                            {a.flags?.scope && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
                                Scope
                              </span>
                            )}
                            {a.flags?.cost && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">
                                Cost
                              </span>
                            )}
                            {a.flags?.drawing && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
                                Drawing
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isFinalised && ((a.flags?.scope || a.flags?.cost) || a.flags?.drawing) && (
                      <div className="flex flex-wrap gap-3 border-t border-slate-200/60 pt-2 mt-1">
                        {(a.flags?.scope || a.flags?.cost) && (
                            a.linkedScopeAdditionId ? (
                               <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-sm">→ SA Logged</span>
                            ) : (
                               isOwner && <button onClick={() => handleCreateSA(idx)} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-rose-600 transition">→ Create Scope Addition</button>
                            )
                        )}
                        {a.flags?.drawing && (
                            a.linkedDrawingId ? (
                               <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-sm">→ Rev Logged</span>
                            ) : (
                               <button onClick={() => handleCreateDrawing(idx)} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600 transition">→ Drawing Tracker</button>
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
                  className="text-sm text-[#1e3a8a] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={14} /> Add Action Item
                </button>
              )}
            </div>
          </AccordionSection>

          <AccordionSection
            title={`Discussion Notes (${draft.notes?.length || 0})`}
            isOpen={activeSection === "notes"}
            onToggle={() =>
              setActiveSection(activeSection === "notes" ? null : "notes")
            }
          >
            <div className="space-y-3">
              {draft.notes?.map((n, idx) => (
                <div
                  key={n.id}
                  className="flex gap-2 items-start bg-transparent border-none p-0"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 shrink-0"></div>
                  <textarea
                    disabled={isFinalised}
                    value={n.text}
                    onChange={(e) => {
                      const nx = [...draft.notes];
                      nx[idx].text = e.target.value;
                      updateDraft({ notes: nx });
                    }}
                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none resize-none min-h-[40px] leading-relaxed"
                  />
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const nx = [...draft.notes];
                        nx.splice(idx, 1);
                        updateDraft({ notes: nx });
                      }}
                      className="text-slate-400 hover:text-red-500 p-1"
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
                  className="text-sm text-[#1e3a8a] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={14} /> Add Note
                </button>
              )}
            </div>
          </AccordionSection>
        </div>

        {/* Footer */}
        {!isFinalised ? (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex-1 py-3 bg-white text-slate-700 border border-slate-300 rounded-xl font-bold hover:bg-slate-50 transition"
            >
              Save as Draft
            </button>
            <button
              onClick={handleFinalise}
              disabled={saving}
              className="flex-1 py-3 bg-[#1e3a8a] text-white rounded-xl font-bold hover:bg-[#1e3a8a]/90 shadow-md transition"
            >
              Finalise MoM
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="font-bold text-slate-800 tracking-wide text-sm">Share Protocol</h3>
                   <p className="text-xs text-slate-500 mt-1">Acknowledge process triggers logging in Comms.</p>
                </div>
                {mom.status === 'acknowledged' && (
                   <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm flex items-center gap-1">
                      <CheckCircle size={12} /> Acknowledged
                   </span>
                )}
             </div>
             
             <div className="flex flex-col sm:flex-row gap-3">
                <button
                   onClick={handleShareWhatsApp}
                   disabled={saving}
                   className="flex-1 flex justify-center items-center gap-2 py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition"
                >
                   <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.472-1.761-1.645-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                   Send on WhatsApp
                </button>
                <button
                   onClick={handleDownloadPdf}
                   disabled={saving}
                   className="flex-1 flex justify-center items-center gap-2 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition"
                >
                   <Download size={18} />
                   Download PDF
                </button>
                <button
                   onClick={handleCopyLink}
                   disabled={saving}
                   className="flex w-12 justify-center items-center py-3 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition"
                   title="Copy Share Link"
                >
                   <Share2 size={18} />
                </button>
             </div>
          </div>
        )}
      </div>

      {/* Hidden printable content for PDF generation */}
      <div className="absolute left-[-9999px] top-[-9999px]">
          <div ref={pdfContentRef} className="w-[800px] bg-white text-black p-8">
            {orgData && (
                 <StudioDocumentShell orgData={orgData} docHeaderType="Minutes of Meeting" docHeaderTitle={mom.meetingTitle}>
                     <div className="space-y-6 text-sm text-slate-800">
                         {/* Attendees */}
                         <div>
                             <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Attendees</h4>
                             <ul className="list-disc pl-5 max-w-none text-slate-800">
                                 {mom.attendees?.map((a, i) => <li key={i}>{a.name} ({a.side})</li>)}
                             </ul>
                         </div>
                         {/* Decisions */}
                         {mom.decisions && mom.decisions.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Decisions Recorded</h4>
                                 <ul className="space-y-2">
                                     {mom.decisions.map((d, i) => (
                                         <li key={i} className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> <span>{d.text}</span></li>
                                     ))}
                                 </ul>
                             </div>
                         )}
                         {/* Action Items */}
                         {mom.actionItems && mom.actionItems.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Action Items</h4>
                                 <table className="w-full text-xs text-left border-collapse border border-slate-200">
                                     <thead className="bg-slate-50 text-slate-700">
                                         <tr>
                                             <th className="border border-slate-200 p-2">Item</th>
                                             <th className="border border-slate-200 p-2">Owner</th>
                                             <th className="border border-slate-200 p-2">Due Date</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {mom.actionItems.map(a => (
                                             <tr key={a.id}>
                                                 <td className="border border-slate-200 p-2 font-medium">{a.text} {a.flags?.cost ? '(Cost Impact)' : ''}</td>
                                                 <td className="border border-slate-200 p-2 uppercase font-bold">{a.owner}</td>
                                                 <td className="border border-slate-200 p-2">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '-'}</td>
                                             </tr>
                                         ))}
                                     </tbody>
                                 </table>
                             </div>
                         )}
                         {/* Notes */}
                         {mom.notes && mom.notes.length > 0 && (
                             <div>
                                 <h4 className="font-bold border-b border-slate-200 pb-1 mb-2 uppercase tracking-wide text-xs text-slate-500">Notes</h4>
                                 <ul className="list-disc pl-5">
                                     {mom.notes.map(n => <li key={n.id}>{n.text}</li>)}
                                 </ul>
                             </div>
                         )}
                         
                         {mom.status === 'acknowledged' && (
                             <div className="mt-8 pt-4 border-t-2 border-emerald-100 bg-emerald-50/50 p-4 rounded-lg flex items-start gap-3">
                                 <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" />
                                 <div>
                                     <p className="font-bold text-emerald-800 text-sm">Acknowledged by {mom.acknowledgedBy}</p>
                                     <p className="text-xs text-emerald-600 mt-0.5">Time: {new Date(mom.acknowledgedAt!).toLocaleString()} via {mom.ackChannel}</p>
                                 </div>
                             </div>
                         )}
                     </div>
                 </StudioDocumentShell>
            )}
          </div>
      </div>

    </div>
  );
}

function AccordionSection({ title, isOpen, onToggle, children }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex justify-between items-center bg-white hover:bg-slate-50 transition"
      >
        <h3 className="font-bold text-slate-800 tracking-wide text-sm">
          {title}
        </h3>
        <span
          className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/30">
          {children}
        </div>
      )}
    </div>
  );
}
