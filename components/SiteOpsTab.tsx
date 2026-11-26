/*
  Execution & Site: the site control room, quality & snags, and meetings & reports.

  These used to be one screen with five tabs, two of which had their own
  sub-tabs, and three tools with a switch inside that: five levels from the
  stage to the electrical plan, and eight rows of tabs for a new user to learn
  (plan item 9). Each is now its own line in the project sidebar, and a screen
  stacks its tools as summary-first sections (components/site/SectionStack),
  opening the one that needs someone.

  Where the other two tabs went:
  - 3D Renders & Drawings sits under Project Hub > Drawings, with the drawings.
  - Procurement sits under Selections & orders, beside the purchase orders it
    read from the same list.
*/
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ClipboardList, FileCheck2, Zap, ListChecks, FileText, BarChart3 } from "lucide-react";
import { ProjectContext, FullBoqItem } from "../types";
import WeeklyPulseManager from "./ops/WeeklyPulseManager";
import DecisionTracker from "./ops/DecisionTracker";
import PreHandoverChecklist from "./ops/PreHandoverChecklist";
import ExecutionWorkspace from "./ExecutionWorkspace";
import { MomActionTracker } from "./ops/MomActionTracker";
import SnagListManager from "./ops/SnagListManager";
import SectionStack, { type StackSection } from "./site/SectionStack";
import { useOrg } from "../contexts/OrgContext";
import { db } from "../services/firebaseClient";
import { trackedActions } from "../lib/minutes";
import {
  snagLine, checklistLine, electricalLine, minutesLine, weeklyLine, firstToOpen, type SectionLine,
} from "../lib/siteSections";

export type SiteView = "control" | "quality" | "meetings" | "decisions";

interface SiteOpsTabProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  decisionBrainOutput?: any;
  boq?: FullBoqItem[];
  projectId: string;
  /** Decision ledger, subscribed to once in App and forwarded to the tracker. */
  decisionLedger?: any[];
  activeProject?: any;
  /** The active version's summary, so the weekly pulse prices payments as Money does. */
  tierSummary?: { totalSell?: number; designFee?: number };
  onProjectUpdate?: (updatedProject: any) => void;
  onAddCalculatedItem?: (name: string, category: string, qty: number, unit: string, roomId: string) => void;
  /** Which screen: the route decides (site-ops, site-quality, site-meetings, record-decision). */
  view?: SiteView;
  /** A section to open instead of the one that needs someone, e.g. from an old link. */
  focus?: string | null;
  onNavigateToTab?: (tab: string) => void;
}

/* Minutes counts for the closed section line; the tracker keeps its own listener on the same query. */
function useMinutesLine(projectId: string, studioId: string | undefined, enabled: boolean): SectionLine {
  const [moms, setMoms] = useState<any[] | null>(null);
  useEffect(() => {
    if (!enabled || !projectId || !studioId) return;
    try {
      const q = query(collection(db, `organizations/${studioId}/projects/${projectId}/moms`), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snap) => setMoms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMoms([]));
    } catch {
      setMoms([]);
      return undefined;
    }
  }, [projectId, studioId, enabled]);
  return useMemo(() => {
    if (moms === null) return { summary: "Loading the minutes…", tone: "none" };
    const tracked = trackedActions(moms);
    const open = tracked.filter((a) => !a.done);
    return minutesLine({
      meetings: moms.length,
      open: open.length,
      overdue: open.filter((a) => a.overdue).length,
      toConfirm: moms.filter((m) => m.status === "shared" || m.status === "correction_requested").length,
    });
  }, [moms]);
}

const SiteOpsTab: React.FC<SiteOpsTabProps> = ({
  projectContext,
  setProjectContext,
  decisionBrainOutput,
  boq = [],
  projectId,
  decisionLedger,
  activeProject,
  tierSummary,
  onProjectUpdate,
  view = "control",
  focus = null,
  onNavigateToTab,
}) => {
  const { orgData } = useOrg();
  const studioId = orgData?.tenantId || "demo-tenant-01";
  const projectName =
    projectContext?.name || (projectContext as any)?.projectName || projectContext?.clientName || "Project";
  const minutes = useMinutesLine(projectId, studioId, view === "meetings");

  const sections: StackSection[] = useMemo(() => {
    if (view === "quality") {
      return [
        {
          id: "snags", title: "Snag list", icon: ClipboardList, line: snagLine(projectContext),
          render: () => <SnagListManager projectContext={projectContext} setProjectContext={setProjectContext} embedded />,
        },
        {
          id: "checklist", title: "Pre-handover checklist", icon: FileCheck2, line: checklistLine(projectContext),
          render: () => (
            <PreHandoverChecklist projectContext={projectContext} setProjectContext={setProjectContext} boq={boq}
              onNavigateToTab={onNavigateToTab} mode="checklist" embedded />
          ),
        },
        {
          id: "electrical", title: "Electrical points check", icon: Zap, line: electricalLine(projectContext),
          render: () => (
            <PreHandoverChecklist projectContext={projectContext} setProjectContext={setProjectContext} boq={boq}
              onNavigateToTab={onNavigateToTab} mode="electrical-plan" embedded />
          ),
        },
      ];
    }
    if (view === "meetings") {
      return [
        {
          id: "minutes", title: "Minutes and actions", icon: ListChecks, line: minutes,
          render: () => (
            <MomActionTracker projectId={projectId} projectContext={projectContext} studioId={studioId}
              projectContextName={projectName} embedded />
          ),
        },
        {
          id: "weekly", title: "Weekly reports", icon: FileText, line: weeklyLine(projectContext),
          render: () => (
            <WeeklyPulseManager projectContext={projectContext} setProjectContext={setProjectContext}
              activeProject={activeProject} mode="reports" embedded />
          ),
        },
        {
          id: "journey", title: "Journey book and report trends", icon: BarChart3,
          line: { summary: "Every week's progress in one place, to share at handover", tone: "none" },
          render: () => (
            <WeeklyPulseManager projectContext={projectContext} setProjectContext={setProjectContext}
              activeProject={activeProject} tierSummary={tierSummary} mode="dashboard" embedded />
          ),
        },
      ];
    }
    return [];
  }, [view, projectContext, setProjectContext, boq, onNavigateToTab, minutes, projectId, studioId, projectName, activeProject, tierSummary]);

  /*
    The section to open: the one asked for, else the first that needs someone.
    Chosen once per screen, so ticking the last snag does not snap the page shut
    under the cursor; `undefined` means "not chosen yet".
  */
  const [open, setOpen] = useState<string | null | undefined>(focus ?? undefined);
  const waiting = view === "meetings" && minutes.summary === "Loading the minutes…";
  useEffect(() => {
    if (open !== undefined || waiting || sections.length === 0) return;
    setOpen(firstToOpen(sections.map((s) => ({ id: s.id, tone: s.line.tone }))));
  }, [open, waiting, sections]);

  if (view === "decisions") {
    return (
      <div className="w-full animate-in fade-in duration-300">
        <DecisionTracker projectContext={projectContext} setProjectContext={setProjectContext}
          projectId={projectId} decisionLedger={decisionLedger || []} />
      </div>
    );
  }

  if (view === "quality" || view === "meetings") {
    return (
      <SectionStack
        label={view === "quality" ? "Quality & snags" : "Meetings & reports"}
        sections={sections}
        open={open ?? null}
        onOpen={setOpen}
      />
    );
  }

  return (
    <div className="w-full animate-in fade-in duration-300">
      <ExecutionWorkspace
        projectContext={projectContext}
        setProjectContext={setProjectContext}
        projectId={projectId}
        executionData={activeProject?.executionData}
        decisionBrainOutput={decisionBrainOutput}
        boq={boq}
        onNavigateDrawings={() => onNavigateToTab?.("drawing-tracker")}
        onUpdateExecutionData={(newData) => {
          onProjectUpdate?.({
            ...(activeProject || { id: projectId, lastModified: Date.now() }),
            executionData: newData,
          });
        }}
      />
    </div>
  );
};

export default SiteOpsTab;
