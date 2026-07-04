import React, { useState } from "react";
import {
  FullBoqItem,
  TimelinePhase as OldTimelinePhase,
  ProjectContext,
} from "../types";
import {
  generateProjectTimeline,
  isAiAvailable,
} from "../services/geminiService";
import Card from "./shared/Card";
import {
  SparklesIcon,
  DeleteIcon,
  ClockIcon,
  FlagIcon,
  CalendarIcon,
  AlertCircleIcon,
  CheckIcon,
} from "./Icons";
import { motion, AnimatePresence } from "framer-motion";
import { useTimelinePhases } from "../hooks/useTimelinePhases";
import { useOrg } from "../contexts/OrgContext";
import { useStudioSettings } from "../hooks/useStudioSettings";
import { usePaymentRequests } from "../hooks/usePaymentRequests";
import { StepDeliverableChecklist } from "./studio/StepDeliverableChecklist";
import { useStepProgress } from "../hooks/useStepProgress";
import { SiteVisitLogModal } from "./SiteVisitLogModal";
import SiteVisitHistory from "../pages/SiteVisitHistory";

interface TimelineTabProps {
  projectId: string | null;
  projectContext?: ProjectContext;
  boq: FullBoqItem[];
  phases: OldTimelinePhase[];
  setPhases: React.Dispatch<React.SetStateAction<OldTimelinePhase[]>>;
}

const TimelineTab: React.FC<TimelineTabProps> = ({
  projectId,
  projectContext,
  boq,
  phases: oldPhases,
  setPhases: setOldPhases,
}) => {
  const { orgData } = useOrg();
  const studioId = orgData.tenantId || "demo-tenant-01";
  const safeProjectId = projectId || "";

  console.log(
    "TimelineTab Rendering with projectId:",
    projectId,
    "safeProjectId:",
    safeProjectId,
  );

  const {
    phases,
    loading,
    buildTimelineFromTemplate,
    updatePhaseDuration,
    shiftTimelinePhases,
    resetTimeline,
  } = useTimelinePhases(safeProjectId, studioId);
  const { settings } = useStudioSettings(studioId);
  const { activeRequest } = usePaymentRequests(safeProjectId, studioId);
  const { updateDeliverable, updateClientSignoff, markStepComplete } =
    useStepProgress(safeProjectId, studioId);

  const [kickoffDate, setKickoffDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const [expandedPhaseIdx, setExpandedPhaseIdx] = useState<number | null>(null);
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [editDuration, setEditDuration] = useState<number>(0);

  const [siteVisitModalOpen, setSiteVisitModalOpen] = useState(false);
  const [siteVisitType, setSiteVisitType] = useState<'site_visit'|'client_meeting'>('site_visit');
  const [showSiteVisitHistory, setShowSiteVisitHistory] = useState(false);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [shiftFromPhase, setShiftFromPhase] = useState<number>(1);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);


  const handleGenerateTimeline = async () => {
    if (!safeProjectId) {
      alert("Please select or save a project first.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
        const steps = settings?.designProcess?.steps || [];
        await buildTimelineFromTemplate(kickoffDate, steps);
    } catch (e: any) {
        setGenerateError(e.message || "Failed to generate timeline");
    } finally {
        setGenerating(false);
    }
  };

  
  const generateWhatsAppMessage = () => {
    const currentPhase = phases.find(p => p.stepProgress?.status === 'in_progress') || phases[0];
    const delayed = phases.filter(p => p.isDelayed);
    const nextMilestone = phases.find(p => p.stepProgress?.status === 'not_started');
    
    let msg = `*Project Update: ${projectContext?.name || 'Your Project'}*\n\n`;
    msg += `*Current Phase:* ${currentPhase?.title || 'Planning'}\n`;
    
    if (delayed.length > 0) {
      msg += `⚠️ *Note:* We are tracking a slight delay in ${delayed.map(d => d.title).join(', ')}. We are working to resolve this.\n`;
    }
    
    if (nextMilestone) {
      msg += `\n*Coming Up Next:* ${nextMilestone.title}\n`;
      msg += `*Estimated Start:* ${new Date(nextMilestone.startDate).toLocaleDateString()}\n`;
    }
    
    msg += `\nTrack full progress live on your Client Portal.\n- FFDS Team`;
    return encodeURIComponent(msg);
  };

  const handleResetTimeline = async () => {
    // window.confirm fails in iframe without allow-modals
    await resetTimeline();
  };

  if (manualMode) {
    // Fallback to Old timeline builder...
    return (
      <OldTimelineBuilder
        boq={boq}
        phases={oldPhases}
        setPhases={setOldPhases}
        onBack={() => setManualMode(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading timeline...</div>
    );
  }

  if (phases.length === 0) {
    const templateSteps = settings?.designProcess?.steps || [];
    const totalDefaultDays = templateSteps.reduce(
      (acc, step) => acc + (step.defaultDuration || 14),
      0,
    );

    return (
      <Card
        title="Execution Schedule"
        titleIcon={<ClockIcon className="w-5 h-5" />}
      >
        <div className="flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
            <CalendarIcon className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-black text-indigo-900 mb-2">
            No timeline yet
          </h2>
          <p className="text-slate-500 mb-8">
            Generate an execution timeline automatically based on your studio's
            standardized design process.
          </p>

          <div className="grid grid-cols-1 gap-6 w-full max-w-md text-left">
            {/* Option A: Generate from template */}
            <div className="border border-indigo-200 rounded-2xl p-6 bg-white shadow-xl shadow-indigo-100">
              <div className="flex items-center gap-2 mb-4 text-indigo-700 font-bold uppercase tracking-wider text-xs">
                <SparklesIcon className="w-4 h-4" />
                <span>Recommended</span>
              </div>
              <h3 className="text-lg font-bold text-indigo-900 mb-1">
                Generate from Phase Template
              </h3>
              <p className="text-sm text-slate-500 pb-1">
                Auto-builds a {templateSteps.length}-phase timeline (
                {totalDefaultDays} days avg) matching your standard process.
              </p>
              <p className="text-xs text-indigo-600 border-b border-slate-100 pb-4 mb-4">
                You can configure these default phases in your global Studio
                Settings.
              </p>

              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Kickoff Date
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 outline-none"
                  value={kickoffDate}
                  onChange={(e) => setKickoffDate(e.target.value)}
                />
              </div>

              {generateError && (
                  <div className="mb-4 w-full bg-red-50 text-red-600 border border-red-200 p-3 rounded-lg text-sm font-bold text-left">
                      Error: {generateError}
                  </div>
              )}

              <button
                onClick={handleGenerateTimeline}
                disabled={generating}
                className={`w-full text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center ${generating ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'}`}
              >
                {generating ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> Building schedule...</>
                ) : (
                    "Generate AI Timeline"
                )}
              </button>
            </div>

            {/* Option B: Manual */}
            <div className="text-center mt-2">
              <button
                onClick={() => setManualMode(true)}
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-4"
              >
                Or build timeline manually
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const completedCount = phases.filter(
    (p) => p.stepProgress?.status === "completed",
  ).length;
  const delayedCount = phases.filter((p) => p.isDelayed).length;
  const kickoff =
    phases.length > 0
      ? new Date(phases[0].startDate).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
      : "";
  const completion =
    phases.length > 0
      ? new Date(phases[phases.length - 1].endDate).toLocaleDateString(
          undefined,
          { day: "numeric", month: "short" },
        )
      : "";

  return (
    <Card>
      {/* Summary Bar */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 -mt-6 -mx-6 mb-6 rounded-t-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium whitespace-nowrap">
            <CalendarIcon className="w-4 h-4" />
            <span>
              Project kickoff:{" "}
              <strong className="text-indigo-900">{kickoff}</strong>
            </span>
          </div>
          <div className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></div>
          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium whitespace-nowrap">
            <FlagIcon className="w-4 h-4" />
            <span>
              Estimated completion:{" "}
              <strong className="text-indigo-900">{completion}</strong>
            </span>
          </div>
          <div className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></div>
          <div className="text-sm text-slate-600 whitespace-nowrap">
            <strong className="text-indigo-900">{phases.length}</strong> phases ·{" "}
            <strong className="text-indigo-900">
              {completedCount}/{phases.length}
            </strong>{" "}
            complete
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
            className="text-[10px] uppercase tracking-widest font-bold text-orange-600 hover:text-orange-700 transition-colors bg-white border border-orange-200 hover:bg-orange-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            🏗️ Log Visit
          </button>
          <button
            onClick={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
            className="text-[10px] uppercase tracking-widest font-bold text-blue-600 hover:text-blue-700 transition-colors bg-white border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            🤝 Log Meeting
          </button>
          
          <button
            onClick={() => setShowWhatsAppModal(true)}
            className="text-[10px] uppercase tracking-widest font-bold text-green-600 hover:text-green-700 transition-colors bg-white border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            💬 WhatsApp Update
          </button>
          <button
            onClick={() => setShowShiftModal(true)}
            className="text-[10px] uppercase tracking-widest font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            ⏭️ Shift Timeline
          </button>
          <button
            onClick={() => setShowSiteVisitHistory(true)}
            className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-700 transition-colors bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            History
          </button>
          <button
            onClick={handleResetTimeline}
            className="text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-red-600 transition-colors bg-white border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg ml-2"
            title="Delete this timeline to re-generate it using updated settings"
          >
            Reset Timeline
          </button>
          {delayedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-md">
              ⚠️ {delayedCount} phase{delayedCount > 1 ? "s" : ""} delayed
            </div>
          )}
          {activeRequest && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-md">
              ⏳ Payment pending: {activeRequest.milestoneLabel}{" "}
              {activeRequest.amount
                ? "· ₹" + activeRequest.amount.toLocaleString("en-IN")
                : ""}
            </div>
          )}
        </div>
      </div>

      {/* Phase List */}
      <div className="space-y-4">
        {phases.map((phase, idx) => {
          const status = phase.stepProgress?.status || "not_started";
          const isDelayed = phase.isDelayed;
          const isExpanded = expandedPhaseIdx === idx;
          const isWorkPaused = projectContext?.status === "work_paused";

          const stepConfig = settings?.designProcess?.steps?.find(
            (s) => s.stepNumber === phase.stepNumber,
          );
          const milestoneLabel = stepConfig?.triggersMilestoneLabel;

          const totalDeliverables =
            phase.stepProgress?.deliverables?.length || 0;
          const checkedDeliverables =
            phase.stepProgress?.deliverables?.filter((d) => d.checked)
              ?.length || 0;

          let headerColor = "bg-slate-50 border-slate-200";
          let iconColor = "bg-slate-100 text-slate-400";
          let titleColor = "text-indigo-900";

          if (status === "completed") {
            headerColor = "bg-emerald-50/50 border-emerald-100";
            iconColor = "bg-emerald-100 text-emerald-600";
            titleColor = "text-emerald-900";
          } else if (status === "in_progress") {
            if (isWorkPaused) {
              headerColor =
                "bg-rose-50/80 border-rose-200 shadow-sm ring-1 ring-rose-100";
              iconColor = "bg-rose-600 text-white shadow-md shadow-rose-200";
              titleColor = "text-rose-900";
            } else {
              headerColor =
                "bg-indigo-50/50 border-indigo-200 shadow-sm ring-1 ring-indigo-50";
              iconColor =
                "bg-indigo-600 text-white shadow-md shadow-indigo-200";
              titleColor = "text-indigo-900";
            }
          } else if (isDelayed) {
            headerColor = "bg-red-50/50 border-red-200";
            iconColor = "bg-red-100 text-red-600";
            titleColor = "text-red-900";
          }

          return (
            <div
              key={phase.stepNumber}
              className={`rounded-xl border relative overflow-hidden transition-all ${headerColor}`}
            >
              {status === "in_progress" && isWorkPaused && (
                <div className="absolute inset-0 bg-rose-500/10 pointer-events-none flex items-center justify-center opacity-70">
                  {/* Subtle overlay stripe effect */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(225, 29, 72, 0.05) 10px, rgba(225, 29, 72, 0.05) 20px)",
                    }}
                  ></div>
                </div>
              )}
              <div
                className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer relative z-10"
                onClick={() => setExpandedPhaseIdx(isExpanded ? null : idx)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${iconColor}`}
                  >
                    {status === "completed" ? (
                      <CheckIcon className="w-5 h-5" />
                    ) : (
                      phase.stepNumber
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className={`font-bold text-lg ${titleColor}`}>
                        {phase.title}
                      </h3>
                      {status === "in_progress" && !isWorkPaused && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded">
                          Current
                        </span>
                      )}
                      {status === "in_progress" && isWorkPaused && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-700 bg-rose-200 px-2.5 py-1 rounded shadow-sm">
                          🔴 Paused
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <div className="text-slate-600 font-medium flex items-center gap-1 group">
                        <span>
                          {new Date(phase.startDate).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short" },
                          )}{" "}
                          –{" "}
                          {new Date(phase.endDate).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short" },
                          )}
                        </span>
                        <span className="text-slate-300 mx-2">|</span>
                        {editingPhaseId === phase.stepNumber ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              min="1"
                              value={editDuration}
                              onChange={(e) =>
                                setEditDuration(parseInt(e.target.value) || 1)
                              }
                              className="w-16 px-1.5 py-0.5 text-sm border border-slate-300 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                            <span className="text-sm">days</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  editDuration > 0 &&
                                  editDuration !== phase.durationDays
                                ) {
                                  updatePhaseDuration(
                                    phase.stepNumber,
                                    editDuration,
                                  );
                                }
                                setEditingPhaseId(null);
                              }}
                              className="ml-1 text-emerald-600 hover:bg-emerald-50 px-1 rounded"
                            >
                              ✓
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPhaseId(null);
                              }}
                              className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 px-1 rounded"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${status === "completed" ? "" : "hover:text-indigo-600 hover:bg-indigo-50 group-hover:underline"}`}
                            disabled={status === "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (status === "completed") return;
                              setEditingPhaseId(phase.stepNumber);
                              setEditDuration(phase.durationDays);
                            }}
                          >
                            <span>{phase.durationDays} days</span>
                            {status !== "completed" && (
                              <svg
                                className="w-3 h-3 opacity-0 group-hover:opacity-100"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200">
                  {milestoneLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-md">
                      <span>⚡</span> Triggers {milestoneLabel}
                    </div>
                  )}
                  {totalDeliverables > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{
                            width: `${(checkedDeliverables / totalDeliverables) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-500">
                        {checkedDeliverables}/{totalDeliverables}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && phase.stepProgress && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-white border-t border-slate-100"
                  >
                    <div className="p-5" onClick={(e) => e.stopPropagation()}>
                      <StepDeliverableChecklist
                        step={phase.stepProgress}
                        projectId={safeProjectId}
                        onUpdateDeliverable={updateDeliverable}
                        onUpdateSignoff={updateClientSignoff}
                        onCompleteStep={markStepComplete}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <SiteVisitLogModal
        isOpen={siteVisitModalOpen}
        onClose={() => setSiteVisitModalOpen(false)}
        projectId={safeProjectId || ""}
        studioId={studioId}
        defaultType={siteVisitType}
        projectContext={projectContext}
        currentPhaseStep={phases.find(p => p.stepProgress?.status === 'in_progress')?.stepProgress?.stepNumber || 1}
        currentPhaseTitle={phases.find(p => p.stepProgress?.status === 'in_progress')?.title || "Planning"}
      />

      {/* Shift Timeline Modal */}
      <AnimatePresence>
        {showShiftModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800">Shift Timeline</h3>
                <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500">
                  Delay or pull forward a portion of the timeline. This shifts the selected phase and all subsequent phases.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Shift from Phase</label>
                  <select 
                    value={shiftFromPhase} 
                    onChange={e => setShiftFromPhase(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                  >
                    {phases.map(p => (
                      <option key={p.stepNumber} value={p.stepNumber}>{p.stepNumber}. {p.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Days to Shift</label>
                  <input 
                    type="number" 
                    value={shiftDays} 
                    onChange={e => setShiftDays(Number(e.target.value) || 0)}
                    placeholder="e.g. 5 (delay) or -3 (pull forward)"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowShiftModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Cancel</button>
                <button 
                  onClick={() => {
                    if (shiftDays !== 0) {
                      // Note: We'll need to call the newly added shiftTimelinePhases hook method here
                      // wait, the hook returned it! Let's ensure it's destructured at the top.
                      (window as any)._lastShiftParams = { shiftFromPhase, shiftDays };
                      shiftTimelinePhases(shiftFromPhase, shiftDays);
                    }
                    setShowShiftModal(false);
                  }} 
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-sm"
                >
                  Apply Shift
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WhatsApp Update Modal */}
      <AnimatePresence>
        {showWhatsAppModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                   <span className="text-green-500">💬</span> Quick Client Update
                </h3>
                <button onClick={() => setShowWhatsAppModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-500 mb-4">
                  Send a quick formatted update to your client via WhatsApp.
                </p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap font-medium">
                  {decodeURIComponent(generateWhatsAppMessage())}
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowWhatsAppModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Close</button>
                <a 
                  href={`https://wa.me/?text=${generateWhatsAppMessage()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm flex items-center gap-2"
                  onClick={() => setShowWhatsAppModal(false)}
                >
                  Open WhatsApp
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {showSiteVisitHistory && (
        <SiteVisitHistory 
          projectId={safeProjectId || ""}
          studioId={studioId}
          onClose={() => setShowSiteVisitHistory(false)}
          projectContext={projectContext}
        />
      )}
    </Card>
  );
};

// -- Old Manual Builder Fallback Component --
const OldTimelineBuilder: React.FC<any> = ({
  boq,
  phases,
  setPhases,
  onBack,
}) => {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [targetDays, setTargetDays] = React.useState<number | ''>('');

  const handleAddPhase = () => {
    setPhases([
      ...(phases || []),
      { phaseName: "New Phase", description: "", startDay: 0, durationDays: 14 }
    ]);
  };

  const handleRemovePhase = (index: number) => {
    const newPhases = [...phases];
    newPhases.splice(index, 1);
    setPhases(newPhases);
  };

  const handlePhaseChange = (index: number, field: string, value: any) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      if (!boq) throw new Error("BOQ is required to generate timeline");
      const result = await generateProjectTimeline(boq);
      setPhases(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentMaxDays = (phases || []).reduce((max: number, p: any) => Math.max(max, (p.startDay || 0) + (p.durationDays || 0)), 0);

  const handleScaleTimeline = () => {
     if (!targetDays || targetDays <= 0 || !phases || phases.length === 0) return;
     if (currentMaxDays === 0) return;
     const ratio = Number(targetDays) / currentMaxDays;
     
     const newPhases = phases.map((p: any) => ({
        ...p,
        startDay: Math.round((p.startDay || 0) * ratio),
        durationDays: Math.max(1, Math.round((p.durationDays || 0) * ratio)) // ensure at least 1 day
     }));
     setPhases(newPhases);
     setTargetDays('');
  };

  return (
    <Card
      title="Build Manual Timeline"
      titleIcon={<ClockIcon className="w-5 h-5" />}
    >
      <button
        onClick={onBack}
        className="text-indigo-600 underline text-sm font-bold mb-6 hover:text-indigo-700"
      >
        &larr; Back to Template Auto-Build
      </button>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 mb-8 text-white shadow-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 opacity-10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
        <div className="relative z-10">
           <h3 className="text-2xl font-black tracking-tight mb-2 text-white">Timeline Summary</h3>
           <p className="text-slate-400 text-sm font-medium">Review and dynamically scale your project schedule.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 relative z-10">
           <div className="bg-white/5 px-5 py-4 rounded-xl backdrop-blur-sm border border-white/10 flex flex-col justify-center">
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Total Duration</div>
              <div className="text-3xl font-black text-white">{currentMaxDays} <span className="text-lg font-medium text-slate-500">Days</span></div>
           </div>
           
           <div className="bg-white/5 px-5 py-4 rounded-xl backdrop-blur-sm border border-white/10 flex flex-col justify-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Scale Entire Timeline</div>
              <div className="flex items-center gap-2">
                 <input 
                    type="number" 
                    placeholder="New Total" 
                    value={targetDays} 
                    onChange={e => setTargetDays(Number(e.target.value) || '')} 
                    className="w-24 px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-bold" 
                 />
                 <button 
                    onClick={handleScaleTimeline} 
                    disabled={!targetDays} 
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-indigo-400 transition-colors shadow-sm"
                 >
                    Apply
                 </button>
              </div>
           </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 tracking-tight">Timeline Phases</h3>
        <div className="flex gap-3">
          {isAiAvailable() && (
            <button 
              onClick={handleGenerateAI}
              disabled={isGenerating || !boq}
              className="px-4 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 disabled:opacity-50 flex items-center gap-2 transition-colors border border-purple-100"
            >
              <SparklesIcon className="w-4 h-4" />
              {isGenerating ? "Generating..." : "Auto-Generate via AI"}
            </button>
          )}
          <button 
             onClick={handleAddPhase}
             className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2"
          >
             <span className="text-lg leading-none">+</span> Add Phase
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl mb-6 text-sm font-bold border border-red-100 flex items-center gap-3"><AlertCircleIcon className="w-5 h-5" /> {error}</div>}

      <div className="space-y-4 relative">
        <div className="absolute left-8 top-4 bottom-4 w-px bg-slate-200 hidden md:block z-0"></div>
        {phases && phases.length > 0 ? phases.map((phase: any, i: number) => (
          <div key={i} className="border border-slate-200 p-6 rounded-2xl relative group bg-white shadow-sm hover:shadow-md transition-shadow z-10 ml-0 md:ml-12">
            <div className="absolute -left-[41px] top-8 w-6 h-6 rounded-full bg-slate-100 border-2 border-slate-300 hidden md:flex items-center justify-center text-[10px] font-black text-slate-500 z-20">
               {i + 1}
            </div>
            
            <button 
               onClick={() => handleRemovePhase(i)}
               className="absolute top-6 right-6 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 hover:bg-red-50 p-2 rounded-lg"
               title="Remove Phase"
            >
               <DeleteIcon className="w-4 h-4" />
            </button>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-4">
              <div className="xl:col-span-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Phase Name</label>
                <input 
                  type="text"
                  value={phase.phaseName}
                  onChange={(e) => handlePhaseChange(i, 'phaseName', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
                  placeholder="e.g. Demolition & Civil"
                />
              </div>
              <div className="xl:col-span-7 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Start Day</label>
                  <div className="relative">
                     <input 
                       type="number"
                       value={phase.startDay}
                       onChange={(e) => handlePhaseChange(i, 'startDay', parseInt(e.target.value) || 0)}
                       className="w-full px-4 py-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
                     />
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Day</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Duration</label>
                  <div className="relative">
                     <input 
                       type="number"
                       value={phase.durationDays}
                       onChange={(e) => handlePhaseChange(i, 'durationDays', parseInt(e.target.value) || 0)}
                       className="w-full px-4 py-3 pl-4 pr-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
                     />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Days</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Description / Scope Details</label>
               <input 
                  type="text"
                  value={phase.description}
                  onChange={(e) => handlePhaseChange(i, 'description', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-600 bg-slate-50 focus:bg-white transition-colors"
                  placeholder="Optional details about this phase"
               />
            </div>
          </div>
        )) : (
          <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
             <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-slate-300" />
             <h4 className="text-lg font-bold text-slate-600 mb-1">No phases defined</h4>
             <p className="text-sm">Add a phase manually or use AI to generate a complete timeline.</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TimelineTab;