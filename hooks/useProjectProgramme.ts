import { useEffect, useMemo, useState } from "react";
import { FullBoqItem, ProjectContext, ProjectSchedule } from "../types";
import { useOrg } from "../contexts/OrgContext";
import { db } from "../services/dbService";
import { useTimelinePhases } from "./useTimelinePhases";
import { useStudioSettings } from "./useStudioSettings";
import { ProgrammeSummary, resolveProjectProgramme } from "../lib/scheduleBuilder";
import { useStudioTerms } from "../components/playground/useStudioTerms";
import { renovationRulesOf } from "../lib/renovation";

/**
 * The project's programme as the Timeline states it, for the screens that
 * quote a duration: the client proposal and the Execution Agreement.
 *
 * Reads what the Timeline reads (the saved schedule, the generated phases and
 * the studio's process template) and resolves it with the same rule
 * (resolveProjectProgramme), so a duration in a document is the duration on
 * the chart. Pass the BOQ the Timeline is given, so the site days agree.
 *
 * Null without a project id: a shared client link has no studio session to
 * read the programme with, and keeps the figures it was sent with.
 */
export function useProjectProgramme(
  projectId: string | undefined,
  projectContext: ProjectContext | undefined,
  boq: FullBoqItem[] | undefined,
): ProgrammeSummary | null {
  const { orgData } = useOrg();
  const studioId = orgData?.tenantId || "";
  const id = projectId || "";
  const { phases } = useTimelinePhases(id, studioId);
  const { settings } = useStudioSettings(studioId);
  /* Terms & Payment: how a renovation is timed (lib/renovation). */
  const { termsSettings } = useStudioTerms(studioId);
  const renovation = useMemo(() => renovationRulesOf(termsSettings), [termsSettings]);
  const [saved, setSaved] = useState<ProjectSchedule | null>(null);

  useEffect(() => {
    if (!id || !studioId) {
      setSaved(null);
      return;
    }
    let active = true;
    db.getSchedule(id)
      .then((s) => { if (active) setSaved(s || null); })
      .catch(() => { if (active) setSaved(null); });
    return () => { active = false; };
  }, [id, studioId]);

  return useMemo(() => {
    if (!id || !studioId || !projectContext) return null;
    try {
      return resolveProjectProgramme({
        projectContext,
        boq: boq || [],
        saved,
        phases: phases as any,
        steps: settings?.designProcess?.steps || [],
        kickoffISO: (projectContext as any)?.kickoffDate,
        renovation,
      });
    } catch (e) {
      console.warn("Could not work out the programme", e);
      return null;
    }
  }, [id, studioId, projectContext, boq, saved, phases, settings?.designProcess?.steps, renovation]);
}
