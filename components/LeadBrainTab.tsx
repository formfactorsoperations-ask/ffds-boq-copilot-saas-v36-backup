import React from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { ProjectContext, LeadProfile, AIStrategy } from "../types";
import BriefReadView from "./brief/BriefReadView";

/**
 * Brief & Site. One screen, so no view switcher in the header: the BOQ is drawn
 * on the plan in the BOQ Editor's Plan lens, not here. It opens as a read of the
 * brief, each part editable in place (components/brief/BriefReadView).
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
  /** A room renamed in the Brief: App carries the name into the BOQ (lib/playground/roomRename). */
  onRenameRoom?: (from: string, to: string) => void;
}

const LeadBrainTab: React.FC<LeadBrainTabProps> = ({
  projectContext,
  setProjectContext,
  aiStrategy = "balanced",
  projectId,
  onRenameRoom,
}) => {
  usePageHeader({
    vitals: [
      { label: "AREA", value: projectContext.area ? `${projectContext.area} sq ft` : "—" },
      { label: "CONFIG", value: projectContext.config || "—" },
      { label: "STYLE", value: projectContext.theme || "—" },
    ],
  }, [projectContext.area, projectContext.config, projectContext.theme]);

  return (
    <BriefReadView
      projectContext={projectContext}
      setProjectContext={setProjectContext}
      projectId={projectId}
      onRenameRoom={onRenameRoom}
    />
  );
};

export default LeadBrainTab;
