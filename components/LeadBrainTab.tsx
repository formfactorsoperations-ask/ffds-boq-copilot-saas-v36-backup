import React, { useState } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { ProjectContext, LeadProfile, AIStrategy, ProposalTier, Item } from "../types";
import ProjectContextCard from "./ProjectContextCard";
import TakeoffPanel from "./TakeoffPanel";

interface LeadBrainTabProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  leadProfile: LeadProfile;
  setLeadProfile: (profile: LeadProfile) => void;
  onStrategyChange?: (strategy: any) => void;
  setActiveTab?: (tab: string) => void;
  aiStrategy?: AIStrategy;
  projectId?: string;
  tiers?: ProposalTier[];
  setTiers?: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  activeTierId?: string;
  bank?: Item[];
}

const LeadBrainTab: React.FC<LeadBrainTabProps> = ({
  projectContext,
  setProjectContext,
  leadProfile,
  setLeadProfile,
  aiStrategy = "balanced",
  projectId,
  tiers,
  setTiers,
  activeTierId,
  bank,
}) => {
  const [subTab, setSubTab] = useState<"brief" | "takeoff">("brief");

  usePageHeader({
    vitals: [
      { label: "AREA", value: projectContext.area ? `${projectContext.area} sq ft` : "—" },
      { label: "CONFIG", value: projectContext.config || "—" },
      { label: "STYLE", value: projectContext.theme || "—" },
    ],
    views: (
      <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 print:hidden">
        <button
          type="button"
          onClick={() => setSubTab("brief")}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === "brief"
              ? "bg-white text-slate-900 shadow-xs font-extrabold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          1 · Brief
        </button>
        <button
          type="button"
          onClick={() => setSubTab("takeoff")}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === "takeoff"
              ? "bg-white text-slate-900 shadow-xs font-extrabold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          2 · Takeoff
        </button>
      </div>
    ),
  }, [projectContext.area, projectContext.config, projectContext.theme, subTab]);

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-300">
      {subTab === "brief" ? (
        /* Always Open Continuous Core Panel */
        <ProjectContextCard
          projectContext={projectContext}
          setProjectContext={setProjectContext}
          aiStrategy={aiStrategy}
          projectId={projectId}
          hideExecutionControls={true}
        />
      ) : (
        <div className="animate-in fade-in duration-300 space-y-6">
          <div className="glass-light p-6 rounded-2xl border border-sky-200/50 shadow-sm">
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-[#1E293B]">Floor-Plan Quantity Takeoff</h3>
              <p className="text-xs text-slate-500 mt-1">
                Deterministic calculation of painting, false ceiling, and tiling quantities directly derived from floor plan room geometry.
              </p>
            </div>
            <TakeoffPanel 
              projectContext={projectContext} 
              setProjectContext={setProjectContext} 
              tiers={tiers}
              setTiers={setTiers}
              activeTierId={activeTierId}
              bank={bank}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadBrainTab;
