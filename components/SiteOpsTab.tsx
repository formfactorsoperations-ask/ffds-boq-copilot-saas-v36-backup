import React, { useState } from "react";
import Tabs from './ui/Tabs';
import { ProjectContext, FullBoqItem } from "../types";
import ClientUpdatesManager from "./ops/ClientUpdatesManager";
import WeeklyPulseManager from "./ops/WeeklyPulseManager";
import DecisionTracker from "./ops/DecisionTracker";
import DesignDocumentsManager from "./ops/DesignDocumentsManager";
import PreHandoverChecklist from "./ops/PreHandoverChecklist";
import ExecutionWorkspace from "./ExecutionWorkspace";
import { MomActionTracker } from "./ops/MomActionTracker";
import ProcurementTab from "./ProcurementTab";
import SnagListManager from "./ops/SnagListManager";
import {
  LayoutDashboard,
  Camera,
  Users,
  ShieldCheck,
  FolderOpen,
  FileCheck2,
  IndianRupee,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Activity,
  Image,
  FileText
} from "lucide-react";
import { useOrg } from "../contexts/OrgContext";

interface SiteOpsTabProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  decisionBrainOutput?: any;
  boq?: FullBoqItem[];
  projectId: string;
  /** Decision ledger, subscribed to once in App and forwarded to the tracker. */
  decisionLedger?: any[];
  activeProject?: any;
  onProjectUpdate?: (updatedProject: any) => void;
  onAddCalculatedItem?: (
    name: string,
    category: string,
    qty: number,
    unit: string,
    roomId: string,
  ) => void;
  initialModule?:
    | "execution"
    | "decision-tracker"
    | "action-tracker"
    | "client-updates"
    | "weekly-reports"
    | "design-docs"
    | "tiling"
    | "electrical"
    | "carpentry"
    | "checklist"
    | "vault"
    | "setup"
    | "workspace"
    | "procurement"
    | "snags";
  onNavigateToTab?: (tab: string) => void;
}

const SiteOpsTab: React.FC<SiteOpsTabProps> = ({
  projectContext,
  setProjectContext,
  decisionBrainOutput,
  boq = [],
  projectId,
  decisionLedger,
  activeProject,
  onProjectUpdate,
  onAddCalculatedItem,
  initialModule = "workspace",
  onNavigateToTab,
}) => {
  const { orgData } = useOrg();

  // Simplified and consolidated 5 execution modules
  const [activeModule, setActiveModule] = useState<
    | "workspace"
    | "vault"
    | "logs"
    | "quality"
    | "procurement"
  >(() => {
    if (
      initialModule === "design-docs" ||
      initialModule === "vault"
    ) {
      return "vault";
    }
    if (initialModule === "checklist" || initialModule === "snags") {
      return "quality";
    }
    if (
      initialModule === "tiling" ||
      initialModule === "electrical" ||
      initialModule === "carpentry" ||
      initialModule === "workspace"
    ) {
      return "workspace";
    }
    if (
      initialModule === "decision-tracker" ||
      initialModule === "action-tracker" ||
      initialModule === "client-updates" ||
      initialModule === "weekly-reports"
    ) {
      return "logs";
    }

    return "workspace";
  });

  // Sub-modules inside Logs & Communications
  const [logsSubMode, setLogsSubMode] = useState<"client-feed" | "weekly-reports" | "action-tracker" | "decision-tracker">(() => {
    if (initialModule === "action-tracker") return "action-tracker";
    if (initialModule === "decision-tracker") return "decision-tracker";
    if (initialModule === "weekly-reports") return "weekly-reports";
    return "client-feed";
  });

  // Sub-modules inside Quality & Checklists
  const [qualitySubMode, setQualitySubMode] = useState<"checklists" | "snags">(() => {
    if (initialModule === "checklist") return "checklists";
    return "snags"; // Default to Snags as it's a critical new feature
  });

  const isDirectModuleView =
    initialModule === "decision-tracker" ||
    initialModule === "action-tracker" ||
    initialModule === "client-updates" ||
    initialModule === "weekly-reports";

  if (isDirectModuleView) {
    return (
      <div className="w-full animate-in fade-in duration-300">
        {initialModule === "decision-tracker" && (
          <DecisionTracker
            projectContext={projectContext}
            setProjectContext={setProjectContext}
            projectId={projectId}
            decisionLedger={decisionLedger || []}
          />
        )}
        {initialModule === "action-tracker" && (
          <MomActionTracker
            projectId={projectId}
            studioId={orgData?.tenantId || "demo-tenant-01"}
            projectContextName={
              projectContext?.projectName ||
              projectContext?.clientName ||
              "N/A"
            }
          />
        )}
        {initialModule === "client-updates" && (
          <ClientUpdatesManager
            projectContext={projectContext}
            setProjectContext={setProjectContext}
            activeProject={activeProject}
          />
        )}
        {initialModule === "weekly-reports" && (
          <WeeklyPulseManager
            projectContext={projectContext}
            setProjectContext={setProjectContext}
            activeProject={activeProject}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-300">
      {/*
        Icons keep their meaning; the five different icon tints did not -- amber,
        sky, emerald and rose on four adjacent tabs read as four unrelated
        sections rather than one control.
      */}
      <Tabs
        ariaLabel="Execution sections"
        value={activeModule}
        onChange={(id) => setActiveModule(id as any)}
        className="w-full print:hidden"
        items={[
          { id: 'workspace', label: 'Site Control Room', icon: LayoutDashboard },
          { id: 'vault', label: '3D Renders & Drawings', icon: Image },
          { id: 'logs', label: 'MOMs, Decisions & Feed', icon: MessageSquare },
          { id: 'quality', label: 'Quality & Snag List', icon: ClipboardList },
          { id: 'procurement', label: 'Procurement', icon: IndianRupee },
        ]}
      />

      {/* Active Workspace Viewport */}
      <div className="animate-in fade-in duration-400">
        {/* 1. Site Workspace Control Room */}
        {activeModule === "workspace" && (
          <ExecutionWorkspace
            projectContext={projectContext}
            setProjectContext={setProjectContext}
            projectId={projectId}
            executionData={activeProject?.executionData}
            decisionBrainOutput={decisionBrainOutput}
            boq={boq}
            onNavigateDrawings={() => {
              setActiveModule("vault");
            }}
            onUpdateExecutionData={(newData) => {
              if (onProjectUpdate) {
                onProjectUpdate({
                  ...(activeProject || { id: projectId, lastModified: Date.now() }),
                  executionData: newData,
                });
              }
            }}
          />
        )}

        {/* 2. 3D Renders & Design Drawings */}
        {activeModule === "vault" && (
          <div className="w-full">
            <DesignDocumentsManager
              projectContext={projectContext}
              setProjectContext={setProjectContext}
            />
          </div>
        )}

        {/* 3. Consolidated Logs & Communications */}
        {activeModule === "logs" && (
          <div className="space-y-6">
            {/* Sub Mode Selector */}
            <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-start w-full gap-1.5 print:hidden">
              <button
                onClick={() => setLogsSubMode("client-feed")}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  logsSubMode === "client-feed"
                    ? "bg-white text-slate-900 shadow-sm font-black border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <Camera className="w-4 h-4 text-[#3D52A0]" />
                Daily Site Feed
              </button>

              <button
                onClick={() => setLogsSubMode("weekly-reports")}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  logsSubMode === "weekly-reports"
                    ? "bg-white text-slate-900 shadow-sm font-black border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <FileText className="w-4 h-4 text-sky-600" />
                Weekly Pulse Reports
              </button>
              
              <button
                onClick={() => setLogsSubMode("action-tracker")}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  logsSubMode === "action-tracker"
                    ? "bg-white text-slate-900 shadow-sm font-black border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <Users className="w-4 h-4 text-emerald-500" />
                MOMs & Action Tracker
              </button>

              <button
                onClick={() => setLogsSubMode("decision-tracker")}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  logsSubMode === "decision-tracker"
                    ? "bg-white text-slate-900 shadow-sm font-black border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Decisions & Sign-offs
              </button>
            </div>

            {/* Render selected Log module */}
            <div className="space-y-6">
              {logsSubMode === "client-feed" && (
                <ClientUpdatesManager
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                  activeProject={activeProject}
                />
              )}

              {logsSubMode === "weekly-reports" && (
                <WeeklyPulseManager
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                  activeProject={activeProject}
                />
              )}

              {logsSubMode === "action-tracker" && (
                <MomActionTracker
                  projectId={projectId}
                  studioId={orgData?.tenantId || "demo-tenant-01"}
                  projectContextName={
                    projectContext?.projectName ||
                    projectContext?.clientName ||
                    "N/A"
                  }
                />
              )}

              {logsSubMode === "decision-tracker" && (
                <DecisionTracker
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                  projectId={projectId}
                  decisionLedger={decisionLedger || []}
                />
              )}
            </div>
          </div>
        )}

        {/* 4. Quality & Snag List Management */}
        {activeModule === "quality" && (
          <div className="space-y-6">
            {/* Sub Mode Selector */}
            <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-inner flex items-center justify-start max-w-md gap-1 print:hidden">
              <button
                onClick={() => setQualitySubMode("snags")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  qualitySubMode === "snags"
                    ? "bg-white text-slate-900 shadow-sm font-black"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <ClipboardList className="w-4 h-4 text-amber-500" />
                Snag List Manager
              </button>

              <button
                onClick={() => setQualitySubMode("checklists")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  qualitySubMode === "checklists"
                    ? "bg-white text-slate-900 shadow-sm font-black"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <FileCheck2 className="w-4 h-4 text-emerald-500" />
                Quality Checklists
              </button>
            </div>

            {/* Render selected Quality module */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              {qualitySubMode === "snags" ? (
                <SnagListManager
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                />
              ) : (
                <PreHandoverChecklist
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                  boq={boq}
                  onNavigateToTab={onNavigateToTab}
                />
              )}
            </div>
          </div>
        )}

        {/* 5. Procurement */}
        {activeModule === "procurement" && (
          <ProcurementTab
            projectContext={projectContext}
            setProjectContext={setProjectContext}
            boq={boq}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
};

export default SiteOpsTab;
