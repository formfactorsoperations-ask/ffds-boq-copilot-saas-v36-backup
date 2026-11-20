import React from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { ProjectContext, LeadProfile, AIStrategy } from "../types";
import ProjectContextCard from "./ProjectContextCard";

/**
 * Brief & Site. One screen, so no view switcher in the header: the BOQ is drawn
 * on the plan in the BOQ Editor's Plan lens, not here.
 */
interface LeadBrainTabProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  leadProfile: LeadProfile;
  setLeadProfile: (profile: LeadProfile) => void;
  onStrategyChange?: (strategy: any) => void;
  setActiveTab?: (tab: string) => void;
  aiStrategy?: AIStrategy;
  projectId?: string;
}

const LeadBrainTab: React.FC<LeadBrainTabProps> = ({
  projectContext,
  setProjectContext,
  aiStrategy = "balanced",
  projectId,
}) => {
  usePageHeader({
    vitals: [
      { label: "AREA", value: projectContext.area ? `${projectContext.area} sq ft` : "—" },
      { label: "CONFIG", value: projectContext.config || "—" },
      { label: "STYLE", value: projectContext.theme || "—" },
    ],
  }, [projectContext.area, projectContext.config, projectContext.theme]);

  return (
    <div className="space-y-8 w-full animate-in fade-in duration-300">
      <ProjectContextCard
        projectContext={projectContext}
        setProjectContext={setProjectContext}
        aiStrategy={aiStrategy}
        projectId={projectId}
        hideExecutionControls={true}
      />
    </div>
  );
};

export default LeadBrainTab;
