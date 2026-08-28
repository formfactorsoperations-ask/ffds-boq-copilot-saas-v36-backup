import { showSuccessWithNext } from './SuccessWithNextToast';
import React, { useState, useEffect } from "react";
import LockedState from './LockedState';
import {
  FullBoqItem,
  TimelinePhase as OldTimelinePhase,
  ProjectContext,
  ProjectSchedule,
  MOM,
  SiteVisit,
} from "../types";
import {
  generateProjectTimeline,
  isAiAvailable,
  generatePhaseAiBriefing,
  generateTimelineDelayPlan,
  PhaseAiBriefing,
  DelayPlan
} from "../services/geminiService";
import Card from "./shared/Card";
import WavyText from "./ui/WavyText";
import {
  Sparkles,
  Calendar,
  Clock,
  AlertTriangle,
  Check,
  ArrowRight,
  Sliders,
  MessageSquare,
  RefreshCw,
  Send,
  Plus,
  Minus,
  Info,
  Settings,
  ChevronRight,
  ChevronDown,
  ListChecks,
  ShieldAlert,
  Award,
  Share2,
  Trash2,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTimelinePhases } from "../hooks/useTimelinePhases";
import { useOrg } from "../contexts/OrgContext";
import { useStudioSettings } from "../hooks/useStudioSettings";
import { usePaymentRequests } from "../hooks/usePaymentRequests";
import { StepDeliverableChecklist } from "./studio/StepDeliverableChecklist";
import { useStepProgress } from "../hooks/useStepProgress";
import { SiteVisitLogModal } from "./SiteVisitLogModal";
import SiteVisitHistory from "../pages/SiteVisitHistory";
import { db as firestoreDb } from "../services/firebaseClient";
import { doc, setDoc, collection, query, onSnapshot } from "firebase/firestore";
import ScheduleGantt from "./ScheduleGantt";
import { buildScheduleFromProject } from "../lib/scheduleBuilder";
import { buildMarkers } from "../lib/scheduleMarkers";
import { db } from "../services/dbService";
import { computeSchedule, DEFAULT_CALENDAR, toDayNum, workSpanEnd, toISO } from "../lib/schedule";

interface TimelineTabProps {
  projectId: string | null;
  projectContext?: ProjectContext;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  boq: FullBoqItem[];
  phases: OldTimelinePhase[];
  setPhases: React.Dispatch<React.SetStateAction<OldTimelinePhase[]>>;
  bank?: any[];
}

const TimelineTab: React.FC<TimelineTabProps> = ({
  projectId,
  projectContext,
  setProjectContext,
  boq,
  phases: oldPhases,
  setPhases: setOldPhases,
  bank,
}) => {
  const { orgData } = useOrg();
  const studioId = orgData.tenantId || "demo-tenant-01";
  const safeProjectId = projectId || "";

  const {
    phases,
    loading,
    buildTimelineFromTemplate,
    updatePhaseDuration,
    updatePhaseDates,
    shiftTimelinePhases,
    resetTimeline,
  } = useTimelinePhases(safeProjectId, studioId);
  
  const { settings } = useStudioSettings(studioId);
  const { activeRequest } = usePaymentRequests(safeProjectId, studioId);
  const { updateDeliverable, updateClientSignoff, markStepComplete } =
    useStepProgress(safeProjectId, studioId);

  // Interaction States
  const [kickoffDate, setKickoffDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Selected Phase for detail view and AI tuning (defaults to active phase)
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState<number>(0);
  const [editingDuration, setEditingDuration] = useState<boolean>(false);
  const [inputDuration, setInputDuration] = useState<number>(0);

  // Configurable Dates States
  const [editStartDate, setEditStartDate] = useState<string>("");
  const [editEndDate, setEditEndDate] = useState<string>("");

  // Modals & Sliders
  const [siteVisitModalOpen, setSiteVisitModalOpen] = useState(false);
  const [siteVisitType, setSiteVisitType] = useState<'site_visit'|'client_meeting'>('site_visit');
  const [showSiteVisitHistory, setShowSiteVisitHistory] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showScheduleResetModal, setShowScheduleResetModal] = useState(false);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const [shiftFromPhase, setShiftFromPhase] = useState<number>(1);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // AI Feature States
  const [aiBriefLoading, setAiBriefLoading] = useState<boolean>(false);
  const [aiBriefData, setAiBriefData] = useState<PhaseAiBriefing | null>(null);
  const [aiDelayLoading, setAiDelayLoading] = useState<boolean>(false);
  const [aiDelayData, setAiDelayData] = useState<DelayPlan | null>(null);
  const [showDelayPlanner, setShowDelayPlanner] = useState<boolean>(false);

  // AI Handover Risk Analyzer States
  const [aiRiskLoading, setAiRiskLoading] = useState<boolean>(false);
  const [aiRiskResult, setAiRiskResult] = useState<any>(null);
  const [aiRiskModalOpen, setAiRiskModalOpen] = useState<boolean>(false);

  const handlePredictHandoverRisks = async () => {
    setAiRiskLoading(true);
    setAiRiskModalOpen(true);
    try {
      const computed = computeSchedule(projectSchedule);
      const res = await fetch("/api/predict-handover-delays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectContext,
          timelinePhases: phases,
          calendar: projectSchedule.calendar || DEFAULT_CALENDAR,
          computedSchedule: {
            startISO: computed.startISO,
            finishISO: computed.finishISO,
            overrunWorkDays: computed.overrunWorkDays,
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiRiskResult(data.data);
      } else {
        alert(data.error || "Failed to generate prediction");
      }
    } catch (e: any) {
      console.error(e);
      alert("Network error: Failed to run predictive analysis");
    } finally {
      setAiRiskLoading(false);
    }
  };

  const handleSaveRiskAlerts = () => {
    if (setProjectContext && aiRiskResult) {
      setProjectContext(prev => ({
        ...prev,
        handoverPrediction: {
          predictedHandoverDate: aiRiskResult.predictedHandoverDate,
          predictedDelayDays: aiRiskResult.predictedDelayDays,
          delayReason: aiRiskResult.delayReason,
          riskLevel: aiRiskResult.riskLevel,
          analyzedAt: Date.now()
        },
        riskAlerts: aiRiskResult.alerts
      }));
      alert("Risk Alerts successfully saved and surfaced to your Dashboard!");
      setAiRiskModalOpen(false);
    }
  };

  // New Schedule states & subscriptions
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [moms, setMoms] = useState<MOM[]>([]);
  useEffect(() => {
    if (!firestoreDb || !safeProjectId || !studioId) return;
    const base = `organizations/${studioId}/projects/${safeProjectId}`;
    const un1 = onSnapshot(query(collection(firestoreDb, `${base}/siteVisits`)),
      s => setVisits(s.docs.map(d => ({ id: d.id, ...d.data() }) as SiteVisit)), () => setVisits([]));
    const un2 = onSnapshot(query(collection(firestoreDb, `${base}/moms`)),
      s => setMoms(s.docs.map(d => ({ id: d.id, ...d.data() }) as MOM)), () => setMoms([]));
    return () => { un1(); un2(); };
  }, [safeProjectId, studioId]);

  const markers = React.useMemo(() => buildMarkers(visits, moms), [visits, moms]);

  const [scheduleOverride, setScheduleOverride] = useState<ProjectSchedule | null>(null);

  // Load persisted schedule
  useEffect(() => {
    if (!safeProjectId) return;
    let active = true;
    const load = async () => {
      try {
        const saved = await db.getSchedule(safeProjectId);
        if (active && saved) {
          setScheduleOverride(saved);
        } else if (active) {
          setScheduleOverride(null); // Reset when switching projects with no custom schedule
        }
      } catch (e) {
        console.warn("Could not load persisted schedule", e);
      }
    };
    load();
    return () => { active = false; };
  }, [safeProjectId]);

  const derivedSchedule = React.useMemo(
    () => buildScheduleFromProject(projectContext, boq, { designSteps: phases as any }),
    [projectContext, boq, phases],
  );
  const projectSchedule = React.useMemo(() => {
    const base = scheduleOverride || derivedSchedule;
    return { ...base, markers };
  }, [scheduleOverride, derivedSchedule, markers]);

  // Bidirectional Sync: phases -> scheduleOverride
  useEffect(() => {
    if (!scheduleOverride || !phases.length) return;

    let changed = false;
    const updatedTasks = scheduleOverride.tasks.map(t => {
      if (t.kind === 'design') {
        const stepNum = parseInt(t.id.replace('design-', ''), 10);
        const phase = phases.find(p => p.stepNumber === stepNum);
        if (phase) {
          const newWorkDays = Math.max(1, phase.durationDays || 5);
          const newNotBefore = phase.startDate?.slice(0, 10);
          if (t.workDays !== newWorkDays || t.notBeforeISO !== newNotBefore) {
            changed = true;
            return {
              ...t,
              workDays: newWorkDays,
              notBeforeISO: newNotBefore
            };
          }
        }
      }
      return t;
    });

    const expectedStartISO = phases[0]?.startDate?.slice(0, 10);
    if (expectedStartISO && scheduleOverride.projectStartISO !== expectedStartISO) {
      changed = true;
    }

    if (changed) {
      const nextSchedule = {
        ...scheduleOverride,
        projectStartISO: expectedStartISO || scheduleOverride.projectStartISO,
        tasks: updatedTasks
      };
      setScheduleOverride(prev => {
        if (JSON.stringify(prev) === JSON.stringify(nextSchedule)) return prev;
        return nextSchedule;
      });
      if (safeProjectId) {
        db.saveSchedule(safeProjectId, nextSchedule).catch(e =>
          console.error("Failed to sync schedule override with phases", e)
        );
      }
    }
  }, [phases, scheduleOverride, safeProjectId]);

  const setProjectSchedule = async (next: ProjectSchedule) => {
    // Bidirectional Sync: next schedule -> phases
    if (projectSchedule && next) {
      next.tasks.forEach(nextTask => {
        if (nextTask.kind === 'design') {
          const currTask = projectSchedule.tasks.find(t => t.id === nextTask.id);
          if (currTask) {
            const stepNum = parseInt(nextTask.id.replace('design-', ''), 10);

            // 1. Sync duration
            if (nextTask.workDays !== currTask.workDays) {
              updatePhaseDuration(stepNum, nextTask.workDays);
            }

            // 2. Sync start date constraint
            if (nextTask.notBeforeISO !== currTask.notBeforeISO && nextTask.notBeforeISO) {
              const startDayNum = toDayNum(nextTask.notBeforeISO);
              const endDayNum = workSpanEnd(DEFAULT_CALENDAR, startDayNum, nextTask.workDays);
              const startISO = nextTask.notBeforeISO + "T00:00:00.000Z";
              const endISO = toISO(endDayNum) + "T23:59:59.000Z";
              updatePhaseDates(stepNum, startISO, endISO);
            }
          }
        }
      });
    }

    setScheduleOverride(next);
    if (safeProjectId) {
      try {
        await db.saveSchedule(safeProjectId, next);
      } catch (e) {
        console.error("Could not save schedule", e);
      }
    }
  };

  const handleResetSchedule = () => {
    setShowScheduleResetModal(true);
  };

  // Auto-focus active phase on load
  useEffect(() => {
    if (phases.length > 0) {
      const activeIdx = phases.findIndex(p => p.stepProgress?.status === 'in_progress');
      if (activeIdx !== -1) {
        setSelectedPhaseIdx(activeIdx);
      } else {
        setSelectedPhaseIdx(0);
      }
    }
  }, [phases.length]);

  // Sync edit duration field and dates when selecting phase
  useEffect(() => {
    if (phases[selectedPhaseIdx]) {
      setInputDuration(phases[selectedPhaseIdx].durationDays);
      setEditStartDate(phases[selectedPhaseIdx].startDate.split("T")[0]);
      setEditEndDate(phases[selectedPhaseIdx].endDate.split("T")[0]);
    }
  }, [selectedPhaseIdx, phases]);

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
        showSuccessWithNext('Execution schedule auto-built successfully from process template.');
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
    
    msg += `\nTrack full progress live on your Client Portal.\n- ${orgData?.orgName || 'The Studio'} Team`;
    return encodeURIComponent(msg);
  };

  const handleResetTimeline = () => {
    setShowResetModal(true);
  };

  // Call Gemini to get specific phase site guidance & custom smart checklist deliverables
  const handleFetchAiBriefing = async (idx: number) => {
    const phase = phases[idx];
    if (!phase) return;
    setAiBriefLoading(true);
    setAiBriefData(null);
    try {
      const result = await generatePhaseAiBriefing(
        phase.title,
        phase.stepProgress?.deliverables?.map(d => d.label) || [],
        projectContext,
        boq
      );
      setAiBriefData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAiBriefLoading(false);
    }
  };

  // Inject a smart deliverable proposed by AI into the actual checklist in Firestore
  const handleAddAiDeliverable = async (label: string, phaseNum: number) => {
    if (!firestoreDb || !safeProjectId || !studioId) return;
    try {
      const stepDocRef = doc(firestoreDb, `studios/${studioId}/projects/${safeProjectId}/stepProgress`, String(phaseNum));
      const step = phases.find(p => p.stepNumber === phaseNum)?.stepProgress;
      if (!step) return;

      const newDel = {
        id: `del_ai_${Math.random().toString(36).substr(2, 9)}`,
        label,
        checked: false,
        fileUrl: null,
        fileName: null
      };

      const updatedDeliverables = [...(step.deliverables || []), newDel];
      await setDoc(stepDocRef, { deliverables: updatedDeliverables }, { merge: true });
      showSuccessWithNext(`"${label}" added to checklist!`);

      // Filter out from UI recommendations
      if (aiBriefData) {
        setAiBriefData({
          ...aiBriefData,
          extraDeliverables: aiBriefData.extraDeliverables.filter(item => item !== label)
        });
      }
    } catch (err) {
      console.error("Error adding AI deliverable:", err);
    }
  };

  // Call Gemini to get delay advisor content
  const handleFetchDelayAdvice = async () => {
    const delayedPhases = phases.filter(p => p.isDelayed);
    if (delayedPhases.length === 0) return;
    setAiDelayLoading(true);
    setAiDelayData(null);
    try {
      const result = await generateTimelineDelayPlan(delayedPhases, projectContext);
      setAiDelayData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAiDelayLoading(false);
    }
  };

  if (manualMode) {
    return (
      <OldTimelineBuilder
        boq={boq}
        phases={oldPhases}
        setPhases={setOldPhases}
        onBack={() => setManualMode(false)}
        projectContext={projectContext}
        bank={bank}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[350px]">
        <div className="w-8 h-8 border-2 border-[#0066CC] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Retrieving site timeline & progress engine...</p>
      </div>
    );
  }

  // Initial State: Prompt generation
  if (phases.length === 0) {
    const templateSteps = settings?.designProcess?.steps || [];
    const totalDefaultDays = templateSteps.reduce(
      (acc, step) => acc + (step.defaultDuration || 14),
      0,
    );

    return (
      <Card
        title="Execution Schedule"
        titleIcon={<Clock className="w-5 h-5 text-slate-800" />}
      >
        <div className="flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-amber-50/50 rounded-full flex items-center justify-center mb-6 border border-amber-100">
            <Calendar className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2 font-display">
            No Execution Schedule Found
          </h2>
          <p className="text-slate-500 mb-8 text-sm">
            Generate a comprehensive on-site timeline based on your studio's
            standardized design and execution stages.
          </p>

          <div className="grid grid-cols-1 gap-6 w-full max-w-md text-left">
            <div className="border border-sky-100 rounded-2xl p-6 bg-white shadow-lg shadow-sky-50/30">
              <div className="flex items-center gap-1.5 mb-4 text-[#0055B3] font-bold uppercase tracking-widest text-[10px]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Recommended</span>
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                Generate via Studio Template
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Creates a sequential {templateSteps.length}-phase scheduled roadmap (~
                {totalDefaultDays} days duration) aligned with your studio's contract settings.
              </p>

              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Target Kickoff Date
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none transition-all font-medium"
                  value={kickoffDate}
                  onChange={(e) => setKickoffDate(e.target.value)}
                />
              </div>

              {generateError && (
                  <div className="mb-4 w-full bg-red-50 text-red-600 border border-red-200 p-3 rounded-xl text-xs font-semibold">
                      {generateError}
                  </div>
              )}

              <button
                onClick={handleGenerateTimeline}
                disabled={generating}
                className={`w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm ${generating ? 'bg-sky-400 cursor-not-allowed' : 'bg-[#0066CC] hover:bg-[#0055B3] cursor-pointer active:scale-[0.99]'}`}
              >
                {generating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Structuring calendar...</>
                ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate AI Timeline</span>
                    </>
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setManualMode(true)}
                className="text-xs font-semibold text-slate-400 hover:text-[#0066CC] transition-colors underline underline-offset-4"
              >
                Or construct schedule manually
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Dates and Summary Calculations
  const completedCount = phases.filter(
    (p) => p.stepProgress?.status === "completed",
  ).length;
  const delayedCount = phases.filter((p) => p.isDelayed).length;
  
  const formatDateStr = (isoString: string) => {
    return new Date(isoString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  };

  const kickoff = formatDateStr(phases[0].startDate);
  const completion = formatDateStr(phases[phases.length - 1].endDate);

  // Total project timeline days computation for visual Gantt bar width calculations
  const pStartMs = new Date(phases[0].startDate).getTime();
  const pEndMs = new Date(phases[phases.length - 1].endDate).getTime();
  const totalProjectDurationMs = pEndMs - pStartMs;

  const selectedPhase = phases[selectedPhaseIdx];

  return (
    <Card>
      {/* 1. Header Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 md:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 -mt-6 -mx-6 mb-6 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#0066CC]/10 text-[#0066CC] rounded-xl border border-sky-200/50">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Project Gantt Schedule</h3>
            <WavyText
              text="Single roadmap covering Design, Procurement, Execution trades, and Handover"
              className="text-[11px] font-medium text-slate-500 block mt-0.5"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
            className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50/50 px-3 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            🏗️ Log Visit
          </button>
          <button
            onClick={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
            className="text-[10px] uppercase tracking-wider font-bold text-sky-700 bg-white border border-sky-200 hover:bg-sky-50/50 px-3 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            🤝 Log Meeting
          </button>
          <button
            onClick={() => setShowWhatsAppModal(true)}
            className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50/50 px-3 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => setShowShiftModal(true)}
            className="text-[10px] uppercase tracking-wider font-bold text-[#0055B3] bg-white border border-sky-200 hover:bg-sky-50/50 px-3 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            ⏭️ Shift
          </button>
          <button
            onClick={() => setShowSiteVisitHistory(true)}
            className="text-[10px] uppercase tracking-wider font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl shadow-xs cursor-pointer"
          >
            History
          </button>
          <button
            onClick={handlePredictHandoverRisks}
            className="text-[10px] uppercase tracking-wider font-bold text-[#B5945B] bg-white border border-[#ebdcb9]/50 hover:bg-amber-50/20 px-3 py-2 rounded-xl shadow-xs flex items-center gap-1 transition-all active:scale-95 font-mono cursor-pointer"
          >
            🧠 AI Predictor
          </button>
          <button
            onClick={handleResetSchedule}
            className="text-[10px] uppercase tracking-wider font-bold text-slate-400 hover:text-red-600 bg-white border border-slate-200 hover:border-red-100 px-3 py-2 rounded-xl shadow-xs cursor-pointer"
            title="Reset schedule to BOQ defaults"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Top Alerts Line */}
      {(delayedCount > 0 || activeRequest) && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {delayedCount > 0 && (
            <button
              onClick={() => {
                setShowDelayPlanner(true);
                handleFetchDelayAdvice();
              }}
              className="flex-1 flex items-center justify-between text-xs font-bold text-red-800 bg-red-50 border border-red-100 px-4 py-3 rounded-2xl hover:bg-red-100/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 animate-pulse" />
                <span>{delayedCount} Design Stage{delayedCount > 1 ? 's' : ''} Delayed. Open AI Catch-up Planner &amp; Client Update Draft.</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {activeRequest && (
            <div className="flex-1 flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50/80 border border-amber-100 px-4 py-3 rounded-2xl">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Pending Payment Milestone: <strong className="text-amber-900">{activeRequest.milestoneLabel}</strong> · ₹{activeRequest.amount?.toLocaleString("en-IN") || '0'}</span>
            </div>
          )}
        </div>
      )}

      {/* AI Delay Recovery Advisor Modal / Drawer */}
      {delayedCount > 0 && showDelayPlanner && (
        <div className="mb-6 border border-red-200 rounded-2xl bg-white shadow-xs overflow-hidden">
          <div className="bg-red-50/50 p-4 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold text-red-900 uppercase tracking-wider">AI Delay Recovery Advisor</span>
            </div>
            <button
              onClick={() => setShowDelayPlanner(false)}
              className="text-xs text-red-700 underline font-bold hover:text-red-900 cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="p-4 space-y-4">
            {aiDelayLoading && (
              <div className="py-6 text-center text-slate-400 flex flex-col items-center justify-center">
                <div className="w-5 h-5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin mb-2"></div>
                <p className="text-xs font-semibold">Formulating buffer-recovery strategies...</p>
              </div>
            )}
            {aiDelayData && !aiDelayLoading && (
              <div className="text-xs space-y-4">
                <div className="bg-red-50/20 border border-red-100 p-3 rounded-xl leading-relaxed">
                  <h6 className="font-bold text-red-950 mb-1 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> Operational Catch-up Strategy
                  </h6>
                  <p className="text-slate-700 font-medium whitespace-pre-wrap">{aiDelayData.catchUpPlan}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl leading-relaxed">
                  <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 pb-1.5">
                    <h6 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#0055B3]" /> Client Portal Update Draft
                    </h6>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiDelayData.clientUpdate);
                        showSuccessWithNext('Draft copied to clipboard!');
                      }}
                      className="text-[9px] font-bold uppercase tracking-wider text-[#0066CC] hover:underline cursor-pointer"
                    >
                      Copy Draft
                    </button>
                  </div>
                  <p className="text-slate-600 italic font-medium whitespace-pre-wrap">"{aiDelayData.clientUpdate}"</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete Gantt Schedule Component */}
      <div className="space-y-6">
        <ScheduleGantt 
          schedule={projectSchedule} 
          onChange={setProjectSchedule} 
          onReset={handleResetSchedule}
          projectContext={projectContext}
          phases={phases}
          projectId={safeProjectId}
          onUpdateDeliverable={updateDeliverable}
          onUpdateSignoff={updateClientSignoff}
          onCompleteStep={markStepComplete}
        />
      </div>

      {/* Modals and Overlays */}
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
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800 font-display">Shift Timeline Range</h3>
                <button onClick={() => setShowShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Delay or pull forward a portion of the timeline. This shifts the selected phase and all downstream milestones forward/backward in the schedule.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Shift from Phase</label>
                  <select 
                    value={shiftFromPhase} 
                    onChange={e => setShiftFromPhase(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-medium"
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-bold text-slate-800"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowShiftModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Cancel</button>
                <button 
                  onClick={() => {
                    if (shiftDays !== 0) {
                      shiftTimelinePhases(shiftFromPhase, shiftDays);
                      showSuccessWithNext('Timeline range shifted successfully!');
                    }
                    setShowShiftModal(false);
                  }} 
                  className="px-5 py-2.5 bg-[#0066CC] text-white rounded-xl text-sm font-bold hover:bg-[#0055B3] shadow-sm"
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
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 font-display">
                   <span className="text-green-500">💬</span> Quick Client Update
                </h3>
                <button onClick={() => setShowWhatsAppModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Send a beautifully formatted status update to your client via WhatsApp.
                </p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-medium">
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

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-red-700 flex items-center gap-2 font-display">
                  ⚠️ Reset Site Timeline
                </h3>
                <button onClick={() => setShowResetModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Are you absolutely sure you want to delete and reset the current site timeline? This will clear all recorded phase dates, milestones, and progress track schedules. This action is permanent.
                </p>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowResetModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Cancel</button>
                <button 
                  onClick={async () => {
                    await resetTimeline();
                    setShowResetModal(false);
                    showSuccessWithNext('Timeline reset successfully!');
                  }}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 shadow-sm"
                >
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule Reset Confirmation Modal */}
      <AnimatePresence>
        {showScheduleResetModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-amber-700 flex items-center gap-2 font-display">
                  ⚠️ Reset Gantt Schedule
                </h3>
                <button onClick={() => setShowScheduleResetModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Are you sure you want to reset the full execution schedule? This will discard custom modifications, baseline shifts, and active holds to rebuild from the latest project BOQ and design phases.
                </p>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowScheduleResetModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Cancel</button>
                <button 
                  onClick={async () => {
                    setScheduleOverride(null);
                    if (safeProjectId && db.deleteSchedule) {
                      try {
                        await db.deleteSchedule(safeProjectId);
                      } catch (e) {
                        console.error("Could not delete custom schedule", e);
                      }
                    }
                    setShowScheduleResetModal(false);
                    showSuccessWithNext('Schedule reset successfully!');
                  }}
                  className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 shadow-sm"
                >
                  Confirm Reset
                </button>
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

      {/* AI Risk Analysis Modal */}
      <AnimatePresence>
        {aiRiskModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FAF9F6] border border-slate-200 shadow-xl rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="bg-white border-b border-slate-200 p-6 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0066CC]/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-500">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest font-mono">AI Handover Risk Diagnostic</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sundays, Holidays & Progress Cross-Reference</p>
                  </div>
                </div>
                <button
                  onClick={() => setAiRiskModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {aiRiskLoading && (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                      <div className="absolute inset-0 border-4 border-[#B5945B] border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Analyzing project timeline...</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                        Cross-referencing trades, public holidays, Sunday offs, and active buffers to predict handover risks.
                      </p>
                    </div>
                  </div>
                )}

                {aiRiskResult && !aiRiskLoading && (
                  <div className="space-y-6">
                    {/* Key Metrics Header */}
                    <div className="bg-white border border-slate-200/60 p-5 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Handover Risk Level</span>
                          <div className="flex items-center gap-2 mt-1">
                            {aiRiskResult.riskLevel === "high" ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase bg-red-50 border border-red-200 text-red-700 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> High Risk
                              </span>
                            ) : aiRiskResult.riskLevel === "medium" ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase bg-amber-50 border border-amber-200 text-amber-700 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> Medium Risk
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full">
                                <Check className="w-3 h-3" /> Healthy (Low Risk)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Predicted Handover</span>
                          <p className="text-base font-extrabold text-slate-900 mt-1">
                            {new Date(aiRiskResult.predictedHandoverDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target Handover</span>
                          <p className="text-xs font-semibold text-slate-700 mt-1">
                            {projectContext?.targetHandoverDate
                              ? new Date(projectContext.targetHandoverDate).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Not specified"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Predicted Delay</span>
                          <p className={`text-xs font-bold mt-1 ${aiRiskResult.predictedDelayDays > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {aiRiskResult.predictedDelayDays > 0
                              ? `${aiRiskResult.predictedDelayDays} Working Days`
                              : "On Schedule / Ahead"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Delay Narrative */}
                    <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl leading-relaxed">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider font-mono mb-2">Executive Analysis</h4>
                      <p className="text-xs text-slate-600 font-medium whitespace-pre-line leading-relaxed">
                        {aiRiskResult.delayReason}
                      </p>
                    </div>

                    {/* Alerts List */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider font-mono">
                        Identified Risk Alerts ({aiRiskResult.alerts?.length || 0})
                      </h4>
                      <div className="space-y-3 divide-y divide-slate-100">
                        {aiRiskResult.alerts && aiRiskResult.alerts.length > 0 ? (
                          aiRiskResult.alerts.map((alertItem: any, index: number) => (
                            <div key={index} className="pt-3 first:pt-0 flex flex-col space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800">{alertItem.title}</span>
                                <span
                                  className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded font-mono ${
                                    alertItem.severity === "high"
                                      ? "bg-red-50 text-red-700 border border-red-100"
                                      : alertItem.severity === "medium"
                                      ? "bg-amber-50 text-amber-700 border border-amber-100"
                                      : "bg-slate-50 text-slate-500 border border-slate-100"
                                  }`}
                                >
                                  {alertItem.severity}
                                </span>
                              </div>
                              <span className="text-[9px] text-[#B5945B] font-bold uppercase tracking-wider">
                                Affected: {alertItem.phase}
                              </span>
                              <p className="text-xs text-slate-500 font-medium leading-relaxed font-sans">
                                {alertItem.description}
                              </p>
                              <div className="bg-emerald-50/20 border border-emerald-100/50 p-2.5 rounded-lg mt-1 text-[11px] leading-relaxed">
                                <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest font-mono block mb-0.5">
                                  🔧 Operational Mitigation Step
                                </span>
                                <span className="text-emerald-950 font-medium">{alertItem.mitigation}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-slate-400 text-xs">
                            No risk alerts generated. Appears perfectly healthy!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-white border-t border-slate-200 p-6 flex justify-end gap-3">
                <button
                  onClick={() => setAiRiskModalOpen(false)}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 uppercase tracking-wider font-mono bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/50"
                >
                  Cancel
                </button>
                {aiRiskResult && !aiRiskLoading && (
                  <button
                    onClick={handleSaveRiskAlerts}
                    className="px-5 py-2.5 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#0055B3] border border-[#B5945B]/30 rounded-xl text-xs font-bold uppercase tracking-wider font-mono flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                  >
                    💾 Save & Surface to Dashboard
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Card>
  );
};

// -- Old Manual Builder Fallback Component --
const OldTimelineBuilder: React.FC<any> = ({
  boq,
  phases,
  setPhases,
  onBack,
  projectContext,
  bank,
}) => {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isCalculating, setIsCalculating] = React.useState(false);
  const [algoMetrics, setAlgoMetrics] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [targetDays, setTargetDays] = React.useState<number | ''>('');

  const scopeAnalysis = React.useMemo(() => {
    if (!boq || boq.length === 0) return null;
    const activeItems = boq.filter(item => (item.quantity || 0) > 0);
    const uniqueRooms = new Set(activeItems.map(item => item.roomName).filter(Boolean));
    
    let totalArea = 0;
    if (projectContext?.scopeOfWorkRooms) {
        totalArea = (Object.values(projectContext.scopeOfWorkRooms) as any[])
            .reduce((sum: number, r: any) => sum + (parseInt(r.sizeSqFt) || 0), 0);
    }
    if (totalArea === 0 && projectContext?.superArea) {
        totalArea = parseInt(projectContext.superArea) || 0;
    }

    // Detect critical categories in active items
    const hasCivil = activeItems.some(item => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('civil') || cat.includes('demolition') || cat.includes('masonry');
    });
    const hasWoodwork = activeItems.some(item => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('wood') || cat.includes('carpentry') || cat.includes('furniture');
    });
    const hasElectricalPlumbing = activeItems.some(item => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('electric') || cat.includes('plumbing') || cat.includes('service');
    });
    const hasPainting = activeItems.some(item => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('paint') || cat.includes('wall finish') || cat.includes('wallpaper');
    });

    return {
        itemCount: activeItems.length,
        roomCount: uniqueRooms.size || 1,
        totalArea: totalArea || 1000,
        hasCivil,
        hasWoodwork,
        hasElectricalPlumbing,
        hasPainting
    };
  }, [boq, projectContext]);

  const handleRunSmartAlgo = () => {
    if (!scopeAnalysis) return;
    setIsCalculating(true);
    
    setTimeout(() => {
        const area = scopeAnalysis.totalArea;
        const rooms = scopeAnalysis.roomCount;
        
        // Base duration calculation
        let designDays = 14; // Default Phase 1 design duration
        if (area > 1500) designDays = 21;
        if (area > 2500) designDays = 28;

        let executionDays = 30; // base site execution days
        
        // Area factor: +1 day per 150 sq ft above 500 sq ft
        if (area > 500) {
            executionDays += Math.round((area - 500) / 150);
        }

        // Room count penalty: +2 days per room above 2 rooms
        if (rooms > 2) {
            executionDays += (rooms - 2) * 2;
        }

        // Category additions
        if (scopeAnalysis.hasCivil) executionDays += 5;
        if (scopeAnalysis.hasWoodwork) executionDays += 10;
        if (scopeAnalysis.hasElectricalPlumbing) executionDays += 5;
        if (scopeAnalysis.hasPainting) executionDays += 5;

        // Cap execution to reasonable limits
        executionDays = Math.min(120, Math.max(25, executionDays));

        // Distribute across standard phases:
        const p1 = designDays;
        const p2 = Math.max(7, Math.round(executionDays * 0.20));
        const p3 = Math.max(10, Math.round(executionDays * 0.30));
        const p4 = Math.max(10, Math.round(executionDays * 0.35));
        const p5 = Math.max(5, executionDays - (p2 + p3 + p4));

        const computedPhases = [
            { 
                phaseName: 'Design & Planning', 
                description: 'Comprehensive 3D visualizations, material selection, layout signing, and Good-for-Construction (GFC) drawings creation.', 
                startDay: 1, 
                durationDays: p1 
            },
            { 
                phaseName: 'Site Setup & Rough-ins', 
                description: 'Site mobilization, surface protection laying, demolition/civil alterations, and plumbing/electrical cabling rough-ins.', 
                startDay: p1 + 1, 
                durationDays: p2 
            },
            { 
                phaseName: 'Structure & Utilities', 
                description: 'False ceiling framing, framing for partitions, plywood carcass assembly, and modular unit preparation.', 
                startDay: p1 + p2 + 1, 
                durationDays: p3 
            },
            { 
                phaseName: 'Finishes & Surfaces', 
                description: 'Laminate pressing, veneer/polish work, wall putty & priming, counter top stone installation, and first coat painting.', 
                startDay: p1 + p2 + p3 + 1, 
                durationDays: p4 
            },
            { 
                phaseName: 'Final Handover', 
                description: 'Modular shutter alignment, electrical fixture fits, final paint coat, deep cleaning, snag lists closure, and handover.', 
                startDay: p1 + p2 + p3 + p4 + 1, 
                durationDays: p5 
            }
        ];

        setPhases(computedPhases);
        setAlgoMetrics({
            totalDays: p1 + executionDays,
            roomCount: rooms,
            totalArea: area,
            itemCount: scopeAnalysis.itemCount
        });
        setIsCalculating(false);
        showSuccessWithNext('Optimal schedule calculated from scope successfully');
    }, 1000);
  };

  const handleAddPhase = () => {
    setPhases([
      ...(phases || []),
      { phaseName: "New Phase", description: "", startDay: 1, durationDays: 14 }
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
      showSuccessWithNext('Timeline generated successfully');
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
      titleIcon={<Clock className="w-5 h-5 text-slate-800" />}
    >
      <button
        onClick={onBack}
        className="text-[#0066CC] underline text-sm font-bold mb-6 hover:text-[#0055B3]"
      >
        &larr; Back to Template Auto-Build
      </button>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 mb-8 text-white shadow-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#0066CC] opacity-10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
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
                    className="w-24 px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-[#0066CC] focus:border-transparent transition-all font-bold" 
                 />
                 <button 
                    onClick={handleScaleTimeline} 
                    disabled={!targetDays} 
                    className="px-4 py-2 bg-[#0066CC] text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-sky-400 transition-colors shadow-sm"
                  >
                    Apply
                  </button>
              </div>
           </div>
        </div>
      </div>

      {/* Smart Calculator Section */}
      {scopeAnalysis && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#0066CC] fill-sky-100 animate-pulse" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">AI Smart Schedule Calculator</h4>
                <p className="text-xs text-slate-500">Computes realistic design + execution timelines based on active BOQ scope, room count, and areas.</p>
              </div>
            </div>

            <button 
              onClick={handleRunSmartAlgo}
              disabled={isCalculating}
              className="flex items-center gap-2 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#0055B3] active:scale-95 disabled:opacity-50 transition-all text-xs font-bold px-4 py-2.5 rounded-xl shadow-md cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
              {isCalculating ? 'Analyzing Scope...' : 'Run Smart Calculator'}
            </button>
          </div>

          {/* Show analyzed scope specs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4 border-t border-slate-200/60 pt-4 text-[11px]">
            <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col justify-between shadow-sm">
              <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wider">Active Items</span>
              <strong className="text-xs font-mono font-extrabold text-slate-900 mt-1">{scopeAnalysis.itemCount} Specs</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col justify-between shadow-sm">
              <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wider">Total Rooms</span>
              <strong className="text-xs font-mono font-extrabold text-slate-900 mt-1">{scopeAnalysis.roomCount} Rooms</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col justify-between shadow-sm">
              <span className="text-slate-500 font-bold block uppercase text-[8px] tracking-wider">Total Size</span>
              <strong className="text-xs font-mono font-extrabold text-slate-900 mt-1">{scopeAnalysis.totalArea} sq ft</strong>
            </div>
            <div className={`rounded-lg p-2 border flex items-center justify-between shadow-sm ${scopeAnalysis.hasCivil ? 'bg-amber-50/50 border-amber-200 text-amber-800 font-semibold' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'}`}>
              <span className="text-[10px]">🔨 Civil</span>
              <span className="font-mono text-[9px]">{scopeAnalysis.hasCivil ? 'Yes (+5d)' : 'No'}</span>
            </div>
            <div className={`rounded-lg p-2 border flex items-center justify-between shadow-sm ${scopeAnalysis.hasWoodwork ? 'bg-amber-50/50 border-amber-200 text-amber-800 font-semibold' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'}`}>
              <span className="text-[10px]">🪚 Wood</span>
              <span className="font-mono text-[9px]">{scopeAnalysis.hasWoodwork ? 'Yes (+10d)' : 'No'}</span>
            </div>
            <div className={`rounded-lg p-2 border flex items-center justify-between shadow-sm ${scopeAnalysis.hasElectricalPlumbing ? 'bg-amber-50/50 border-amber-200 text-amber-800 font-semibold' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'}`}>
              <span className="text-[10px]">⚡ Utilities</span>
              <span className="font-mono text-[9px]">{scopeAnalysis.hasElectricalPlumbing ? 'Yes (+5d)' : 'No'}</span>
            </div>
            <div className={`rounded-lg p-2 border flex items-center justify-between shadow-sm ${scopeAnalysis.hasPainting ? 'bg-amber-50/50 border-amber-200 text-amber-800 font-semibold' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'}`}>
              <span className="text-[10px]">🎨 Painting</span>
              <span className="font-mono text-[9px]">{scopeAnalysis.hasPainting ? 'Yes (+5d)' : 'No'}</span>
            </div>
          </div>

          {algoMetrics && (
            <div className="mt-4 bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
              <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                <strong>Optimal Timeline Computed:</strong> Formulated a realistic <strong>{algoMetrics.totalDays}-Day schedule</strong> matching your active BOQ and {algoMetrics.roomCount} Rooms. Your timeline phases below have been updated.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 tracking-tight">Timeline Phases</h3>
        <div className="flex gap-3">
          {isAiAvailable() && (
            <button 
              onClick={handleGenerateAI}
              disabled={isGenerating || !boq}
              className="px-4 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 disabled:opacity-50 flex items-center gap-2 transition-colors border border-purple-100"
            >
              <Sparkles className="w-4 h-4" />
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

      {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl mb-6 text-sm font-bold border border-red-100 flex items-center gap-3"><AlertTriangle className="w-5 h-5" /> {error}</div>}

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
               <Trash2 className="w-4 h-4" />
            </button>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-4">
              <div className="xl:col-span-5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Phase Name</label>
                <input 
                  type="text"
                  value={phase.phaseName}
                  onChange={(e) => handlePhaseChange(i, 'phaseName', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
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
                       className="w-full px-4 py-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
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
                       className="w-full px-4 py-3 pl-4 pr-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0066CC] outline-none text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white transition-colors"
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
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0066CC] outline-none text-sm text-slate-600 bg-slate-50 focus:bg-white transition-colors"
                  placeholder="Optional details about this phase"
               />
            </div>
          </div>
        )) : (
          <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
             <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-300" />
             <h4 className="text-lg font-bold text-slate-600 mb-1">No phases defined</h4>
             <p className="text-sm">Add a phase manually or use AI to generate a complete timeline.</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TimelineTab;
