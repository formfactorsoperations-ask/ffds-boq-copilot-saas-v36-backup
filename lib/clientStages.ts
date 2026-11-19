/*
  The client's six stages, read from the Ops Matrix.

  The portal used to work out where a project stood from its status: Won meant
  stage 4, so stages 1 to 3 printed "complete" on a project whose Ops Matrix
  stood at 12% with Space Planning not yet approved. A status is a label the
  studio sets for the pipeline; it says the client said yes, not that the
  brief, the layouts and the 3D were done.

  The Ops Matrix is the studio's own record of what has happened, step by step.
  Each step belongs to one client stage below. A stage is complete when every
  one of its steps is ticked, and the project stands at the first stage that is
  not -- so the portal can never call a stage complete that the studio has not.
*/
import { JOURNEY_STEPS } from '../constants/journeyConstants';
import { engagementOf, journeyStepsFor } from './engagement';

/*
  Where each step sits among the client's stages. Steps not named here go by
  their matrix phase: Pre-Execution and Execution are site work (stage 5),
  Handover is stage 6.
*/
const STAGE_OF_STEP: Record<string, number> = {
  // 1. Brief & Discovery
  discovery_scheduled: 1,
  discovery_completed: 1,
  brief_frozen: 1,
  // 2. Scope & Terms: the 2D layouts and the Terms Docket
  space_planning_presented: 2,
  space_planning_approved: 2,
  terms_docket_acknowledged: 2,
  // 3. 3D & Selections, closed by the design approval
  visuals_3d_developed: 3,
  visuals_3d_shared: 3,
  revisions_incorporated: 3,
  design_approved: 3,
  // 4. Scope freeze & contract (on a design-only project, the GFC set)
  boq_shared: 4,
  payment_schedule_sent: 4,
  agreement_signed: 4,
  design_fee_received: 4,
  onboarding_kit_sent: 4,
  working_drawings_done: 4,
  gfc_set_issued: 4,
};

const stageOfStep = (id: string, phase: number): number =>
  STAGE_OF_STEP[id] ?? (phase >= 5 ? 6 : 5);

export interface ClientStageReading {
  /** The first stage with a step still open; 6 once everything is done. */
  stage: number;
  /** Steps done and in total, per stage number. */
  perStage: Record<number, { done: number; total: number }>;
}

/**
 * The client's current stage from the steps ticked on the Ops Matrix, or null
 * when this project has no record of them (a portal copy sent before the
 * matrix published its steps).
 */
export function clientStageFromJourney(ctx: any): ClientStageReading | null {
  const done = ctx?.journeySummary?.doneSteps;
  if (!Array.isArray(done)) return null;
  const doneSet = new Set<string>(done);

  const perStage: Record<number, { done: number; total: number }> = {};
  for (let n = 1; n <= 6; n++) perStage[n] = { done: 0, total: 0 };
  journeyStepsFor(engagementOf(ctx), JOURNEY_STEPS).forEach((s) => {
    const n = stageOfStep(s.id, s.phase);
    perStage[n].total += 1;
    if (doneSet.has(s.id)) perStage[n].done += 1;
  });

  let stage = 6;
  for (let n = 1; n <= 6; n++) {
    const p = perStage[n];
    if (p.total > 0 && p.done < p.total) { stage = n; break; }
  }
  return { stage, perStage };
}
