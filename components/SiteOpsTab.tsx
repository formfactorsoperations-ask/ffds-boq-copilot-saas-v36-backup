import React, { useState } from "react";
import { ProjectContext, FullBoqItem } from "../types";
import ClientUpdatesManager from "./ops/ClientUpdatesManager";
import DecisionTracker from "./ops/DecisionTracker";
import DesignDocumentsManager from "./ops/DesignDocumentsManager";
import PreHandoverChecklist from "./ops/PreHandoverChecklist";
import ExecutionWorkspace from "./ExecutionWorkspace";
import { MomActionTracker } from "./ops/MomActionTracker";
import { HardHatIcon } from "./Icons";
import {
  LayoutDashboard,
  Camera,
  Users,
  ShieldCheck,
  FolderClosed,
  FolderOpen,
  FileCheck2,
} from "lucide-react";
import { useOrg } from "../contexts/OrgContext";

interface SiteOpsTabProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  decisionBrainOutput?: any;
  boq?: FullBoqItem[];
  projectId: string;
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
    | "design-docs"
    | "tiling"
    | "electrical"
    | "carpentry"
    | "checklist"
    | "vault"
    | "setup"
    | "workspace";
}

const SiteOpsTab: React.FC<SiteOpsTabProps> = ({
  projectContext,
  setProjectContext,
  decisionBrainOutput,
  boq = [],
  projectId,
  activeProject,
  onProjectUpdate,
  onAddCalculatedItem,
  initialModule = "workspace",
}) => {
  const { orgData } = useOrg();

  // Map legacy / initial tabs gracefully into our core 5 pillars
  const [activeModule, setActiveModule] = useState<
    | "workspace"
    | "client-updates"
    | "action-tracker"
    | "decision-tracker"
    | "vault"
  >(() => {
    if (
      initialModule === "design-docs" ||
      initialModule === "checklist" ||
      initialModule === "vault"
    ) {
      return "vault";
    }
    if (
      initialModule === "tiling" ||
      initialModule === "electrical" ||
      initialModule === "carpentry" ||
      initialModule === "workspace"
    ) {
      return "workspace";
    }
    // Map old decision-tracker to decision-tracker
    if (initialModule === "decision-tracker") return "decision-tracker";
    if (initialModule === "action-tracker") return "action-tracker";
    if (initialModule === "client-updates") return "client-updates";

    return "workspace";
  });

  const [vaultSubMode, setVaultSubMode] = useState<"drawings" | "checklist">(
    () => {
      if (initialModule === "checklist") {
        return "checklist";
      }
      return "drawings";
    },
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-indigo-900 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-indigo-950 text-white rounded-2xl shadow-sm">
              <LayoutDashboard className="w-6 h-6" />
            </span>
            Execution Control Room
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-1 ml-1">
            Form Factors execution intelligence layer. Driving decisions, logs,
            and site alignment.
          </p>
        </div>
      </div>

      {/* Premium, Consolidated Flat Navigation Bar */}
      <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shadow-inner w-full print:hidden gap-1">
        <button
          onClick={() => setActiveModule("workspace")}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 ${
            activeModule === "workspace"
              ? "bg-indigo-950 text-white shadow-md"
              : "text-slate-600 hover:bg-white/50 hover:text-indigo-950"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Site Control Room
        </button>

        <button
          onClick={() => setActiveModule("client-updates")}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 ${
            activeModule === "client-updates"
              ? "bg-indigo-950 text-white shadow-md"
              : "text-slate-600 hover:bg-white/50 hover:text-indigo-950"
          }`}
        >
          <Camera className="w-4 h-4 text-indigo-500" />
          Interactive Client Feed
        </button>

        <button
          onClick={() => setActiveModule("action-tracker")}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 ${
            activeModule === "action-tracker"
              ? "bg-indigo-950 text-white shadow-md"
              : "text-slate-600 hover:bg-white/50 hover:text-indigo-950"
          }`}
        >
          <Users className="w-4 h-4 text-emerald-500" />
          MOMs & Actions
        </button>

        <button
          onClick={() => setActiveModule("decision-tracker")}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 ${
            activeModule === "decision-tracker"
              ? "bg-indigo-950 text-white shadow-md"
              : "text-slate-600 hover:bg-white/50 hover:text-indigo-950"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          Decisions Log
        </button>

        <button
          onClick={() => setActiveModule("vault")}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 ${
            activeModule === "vault"
              ? "bg-indigo-950 text-white shadow-md"
              : "text-slate-600 hover:bg-white/50 hover:text-indigo-950"
          }`}
        >
          <FolderClosed className="w-4 h-4 text-sky-500" />
          Site Vault & GFCs
        </button>
      </div>

      {/* Active Workspace Viewport */}
      <div className="animate-in fade-in duration-400">
        {activeModule === "workspace" && (
          <ExecutionWorkspace
            projectContext={projectContext}
            projectId={projectId}
            executionData={activeProject?.executionData}
            decisionBrainOutput={decisionBrainOutput}
            boq={boq}
            onNavigateDrawings={() => {
              setActiveModule("vault");
              setVaultSubMode("drawings");
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

        {activeModule === "client-updates" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <ClientUpdatesManager
              projectContext={projectContext}
              setProjectContext={setProjectContext}
            />
          </div>
        )}

        {activeModule === "action-tracker" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <MomActionTracker
              projectId={projectId}
              studioId={orgData?.tenantId || "demo-tenant-01"}
              projectContextName={
                projectContext?.projectName ||
                projectContext?.clientName ||
                "N/A"
              }
            />
          </div>
        )}

        {activeModule === "decision-tracker" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <DecisionTracker
              projectContext={projectContext}
              setProjectContext={setProjectContext}
              projectId={projectId}
            />
          </div>
        )}

        {activeModule === "vault" && (
          <div className="space-y-6">
            {/* Selector inside Site Vault and GFCs to handle GFC vs Quality checks in a beautiful workspace context */}
            <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shadow-inner flex items-center justify-start max-w-lg gap-1">
              <button
                onClick={() => setVaultSubMode("drawings")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  vaultSubMode === "drawings"
                    ? "bg-white text-indigo-900 shadow-sm"
                    : "text-slate-500 hover:text-indigo-900"
                }`}
              >
                <FolderOpen className="w-4 h-4 text-sky-500" />
                GFC Drawings & Plans
              </button>
              <button
                onClick={() => setVaultSubMode("checklist")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  vaultSubMode === "checklist"
                    ? "bg-white text-indigo-900 shadow-sm"
                    : "text-slate-500 hover:text-indigo-900"
                }`}
              >
                <FileCheck2 className="w-4 h-4 text-emerald-500" />
                Quality Checklists
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              {vaultSubMode === "drawings" ? (
                <DesignDocumentsManager
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                />
              ) : (
                <PreHandoverChecklist
                  projectContext={projectContext}
                  setProjectContext={setProjectContext}
                  boq={boq}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteOpsTab;
