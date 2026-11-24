import React from "react";
import { motion } from "framer-motion";
import { FullProjectData } from "../types";
import { formatCompactINR } from "../lib/utils";
import { useStudioHomeData, tabFor } from "./home/useStudioHomeData";
import { AttentionState, TOMORROW_9AM } from "../services/attentionState";
import StudioFooter from "./home/StudioFooter";
import DayBoard from "./home/DayBoard";
import StoryDeck from "./home/StoryDeck";
import { useHomeFeeds } from "./home/useHomeFeeds";
import { useAttentionRows } from "./home/useAttention";
import AskStudio from "./home/AskStudio";

/**
 * STUDIO HOME (the owner's chosen design, Option 6; DESIGN.md → "Home stories"
 * and "Your day, in order").
 *
 * Two parts, read top to bottom:
 *
 *   The stories   a greeting, the projects you were last in, story rings, a
 *                 fanned deck of cards and a strip of swatches (StoryDeck).
 *   Your day      every widget pinned along a path in the order to do it:
 *                 checking in, your sheets, reviews, the projects that need
 *                 you, the week ahead with clients, the team (DayBoard).
 *   Ask           a question about the studio, answered from the same data
 *                 (AskStudio).
 *
 * Nothing of the day sits below the board: the old attention panel, recent
 * projects rail and clock-and-calendar strip were folded into it.
 *
 * Figures come from useStudioHomeData rather than being derived here, so the
 * page and anything else reading the portfolio cannot disagree about how many
 * projects are live.
 */

interface Props {
  projects: FullProjectData[];
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  onCreateNew: () => void;
  onNavigate: (tab: string) => void;
  /** projectId -> the tab this person last had open in it. */
  lastTabs?: Record<string, string>;
  /** Snoozed / dismissed items, per person. */
  attention?: AttentionState;
  onAttentionChange?: (projectId: string, entry: { snoozedUntil?: number; dismissedAt?: number }) => void;
  role: string;
  /** Every role they hold (lib/roles); Home shows what any of them opens. Defaults to `role`. */
  roles?: string[];
  userName?: string;
}

export default function StudioHomeOrbit({
  projects, onOpenProject, onCreateNew, onNavigate, role, roles, userName = "there", lastTabs = {},
  attention = {}, onAttentionChange,
}: Props) {
  const data = useStudioHomeData(projects, role);
  /* What Home reads live, once: the Design Desk's sheets and client visits, for the deck and the board. */
  const feeds = useHomeFeeds(projects, role, roles);
  const rows = useAttentionRows(data.worklist, attention, role);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full px-3 lg:px-6 pb-16 space-y-6 font-['Plus_Jakarta_Sans']"
    >
      {/* The top of Home: greeting, recent projects, story rings, the fanned deck and the swatches. */}
      <StoryDeck feeds={feeds} projects={projects} role={role} roles={roles} userName={userName}
        counts={{ active: data.activeCount, pipeline: data.pipelineCount, booked: data.bookedValue, open: data.openValue, winRate: data.winRate }}
        recent={data.recent} onResume={(p) => onOpenProject(p, lastTabs[p.id])}
        onNavigate={onNavigate} onOpenProject={(p) => onOpenProject(p)} onCreateNew={onCreateNew} />

      {/* Your day, in order: every widget pinned along a path, the most pressing first. */}
      <div className="max-w-[1400px] mx-auto w-full">
        <DayBoard feeds={feeds} projects={projects} onNavigate={(t) => onNavigate?.(t)}
          attention={{
            rows,
            money: formatCompactINR,
            onOpen: (r, a) => onOpenProject(r.project, tabFor(a?.route)),
            onSnooze: onAttentionChange ? (id) => onAttentionChange(id, { snoozedUntil: TOMORROW_9AM() }) : undefined,
            onDismiss: onAttentionChange ? (id) => onAttentionChange(id, { dismissedAt: Date.now() }) : undefined,
          }} />
      </div>

      {/* Ask the studio: a question answered from what Home holds for this person. */}
      <AskStudio feeds={feeds} projects={projects} rows={rows} role={role} roles={roles} />

      <div className="max-w-[1400px] mx-auto w-full">
        <StudioFooter onNavigate={onNavigate} />
      </div>
    </motion.div>
  );
}
