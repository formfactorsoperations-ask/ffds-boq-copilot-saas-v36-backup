import { useMemo } from "react";
import { FullProjectData } from "../../types";
import { getNextActions } from "../../services/nextActionEngine";
import { getSingleProjectValue } from "../../lib/financialsUtils";

/**
 * The studio's home-page figures, in one place.
 *
 * Lifted out of StudioHome so a second home-page design can show the SAME
 * numbers rather than re-deriving them. Two copies of this arithmetic would
 * drift the first time a status string changed, and the two pages would
 * quietly disagree about how many projects are live -- which is exactly the
 * kind of thing nobody notices until a client is on the call.
 *
 * Behaviour is unchanged from the original inline useMemo; this is a move,
 * not a rewrite.
 */
export interface StudioHomeData {
  activeCount: number;
  pipelineCount: number;
  deliveredCount: number;
  clientsCount: number;
  attentionCount: number;
  openValue: number;
  bookedValue: number;
  winRate: number;
  worklist: Array<{ project: FullProjectData; action: any }>;
  dist: { pipeline: number; active: number; delivered: number };
  recent: FullProjectData[];
}

export function useStudioHomeData(projects: FullProjectData[], role: string): StudioHomeData {
  return useMemo(() => {  
    const activeStatuses = ["won", "execution", "work_paused"];
    const pipelineStatuses = ["lead", "draft", "proposal_sent", "negotiation"];
    const deliveredStatuses = ["completed"];
    const lostStatuses = ["lost", "archived"];

    let activeCount = 0;
    let pipelineCount = 0;
    let deliveredCount = 0;
    let lostCount = 0;
    const clientKeys = new Set<string>();

    let openValue = 0;
    let bookedValue = 0;

    const worklist: Array<{ project: FullProjectData; action: any }> = [];

    // Map projects to extract stats
    for (const p of projects) {
      const status = p.context?.status || "draft";
      const pVal = getSingleProjectValue(p);

      // Classify bucket
      if (activeStatuses.includes(status)) {
        activeCount++;
        bookedValue += pVal;
        openValue += pVal;
      } else if (pipelineStatuses.includes(status)) {
        pipelineCount++;
        openValue += pVal;
      } else if (deliveredStatuses.includes(status)) {
        deliveredCount++;
      } else if (lostStatuses.includes(status)) {
        lostCount++;
      }

      // Track unique clients
      const clientEmail = p.context?.clientEmail;
      const clientName = p.context?.clientName;
      if (clientEmail || clientName) {
        const key = (clientEmail || clientName).toLowerCase().trim();
        clientKeys.add(key);
      }

      // Build Cross-Project Worklist (Only non-closed)
      if (status !== "completed" && status !== "lost" && (status as any) !== "archived") {
        const nextActionsCtx = {
          project: p.context,
          designPaymentStages: p.context?.paymentMilestones,
          designGate: (p.context as any)?.designGate,
          drawingTrackerSummary: null,
          scopeAdditionsSummary: {
            pending: ((p.context as any)?.scopeAdditions || []).filter(
              (s: any) => s.status === "pending_approval" || s.status === "pending"
            ).length
          },
          timeline: null
        };

        const actions = getNextActions(nextActionsCtx, role);
        if (actions && actions.length > 0) {
          worklist.push({
            project: p,
            action: actions[0] // take top action
          });
        }
      }
    }

    // Sort worklist: blocker first, then due, then suggested
    const priorityOrder: Record<string, number> = { blocker: 0, due: 1, suggested: 2 };
    worklist.sort((a, b) => priorityOrder[a.action.priority] - priorityOrder[b.action.priority]);

    const blockersCount = worklist.filter(w => w.action.priority === "blocker").length;
    const dueCount = worklist.filter(w => w.action.priority === "due").length;
    const attentionCount = blockersCount + dueCount;

    // Win rate: (won + completed) / (won + completed + lost)
    const totalDecided = activeCount + deliveredCount + lostCount;
    const winRate = totalDecided > 0 ? Math.round(((activeCount + deliveredCount) / totalDecided) * 100) : 0;

    // Portfolio flow distribution
    const totalCount = pipelineCount + activeCount + deliveredCount;
    const dist = {
      pipeline: totalCount > 0 ? (pipelineCount / totalCount) * 100 : 0,
      active: totalCount > 0 ? (activeCount / totalCount) * 100 : 0,
      delivered: totalCount > 0 ? (deliveredCount / totalCount) * 100 : 0
    };

    // Recent non-closed projects sorted by lastModified descending
    const recent = projects
      .filter(p => p.context?.status !== "completed" && p.context?.status !== "lost" && (p.context?.status as any) !== "archived")
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 4);

    return {
      activeCount,
      pipelineCount,
      deliveredCount,
      clientsCount: clientKeys.size,
      attentionCount,
      openValue,
      bookedValue,
      winRate,
      worklist,
      dist,
      recent
    };
  }, [projects, role]);
}

/* Action routes carry deep-link hints like "payment-calc?focus=e1", but
   activeTab is matched as an exact string, so the query made every one of them
   render a blank screen. The hint is not consumed anywhere yet; strip it and
   navigate to the tab itself. */
export const tabFor = (route?: string) => (route || "dashboard").split("?")[0];

export const greetingWord = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
