/*
  A project is won when the client's sign-up payment comes in.

  That holds for every engagement. A design-only project is won on its first
  design payment, and so is a turnkey one: the sign-up payment comes before
  the design, and long before any execution. Recording it as paid on Money
  moves a project still in the pipeline to Won by itself, the same Won the
  status window sets: lifecycle stage 4, held against the journey, and the
  Ops Matrix ticks no design or contracting step for it
  (services/journeyEngine inferenceStage).

  It happens once. If the studio then moves the project back by hand, the
  payment does not move it to Won again.
*/

import type { PaymentMilestone, ProjectContext, ProjectStatus, HistoryEvent } from '../types';

/** Statuses a sign-up payment moves on from. */
const PIPELINE: ReadonlySet<string> = new Set(['lead', 'draft', 'proposal_sent', 'negotiation']);

/**
 * The sign-up payment: the first design milestone in the schedule (D1,
 * "Sign-up & Concept"), or the first milestone when the project bills no
 * design fee.
 */
export function signupMilestone(ctx: Pick<ProjectContext, 'paymentMilestones'> | null | undefined): PaymentMilestone | null {
  const all = ctx?.paymentMilestones || [];
  return all.find((m) => m?.type === 'design') || all[0] || null;
}

export const signupPaid = (ctx: Pick<ProjectContext, 'paymentMilestones'> | null | undefined): boolean =>
  signupMilestone(ctx)?.status === 'paid';

/** Whether the sign-up payment should move this project to Won now. */
export function shouldWinOnSignup(ctx: ProjectContext | null | undefined): boolean {
  if (!ctx || ctx.signupWonAt || (ctx as any).termination) return false;
  if (!PIPELINE.has(String(ctx.status || 'draft'))) return false;
  return signupPaid(ctx);
}

/** The project moved to Won on its sign-up payment. */
export function winOnSignup(ctx: ProjectContext, now: number, actor: string): ProjectContext {
  const prev = (ctx.status || 'draft') as ProjectStatus;
  const m = signupMilestone(ctx);
  const entry: HistoryEvent = {
    id: `hist_${now}_signup`,
    at: now,
    actor,
    category: 'stage',
    summary: `Status updated from "${prev}" to "won"`,
    detail: `Sign-up payment received${m?.name ? ` (${m.name})` : ''}.`,
  };
  return {
    ...ctx,
    status: 'won',
    currentStage: 4,
    lifecycle: {
      ...(ctx.lifecycle || { stage: 1, subState: 'active', gates: {} as any, enteredStageAt: now, updatedAt: now }),
      stage: 4 as any,
      updatedAt: now,
    } as any,
    history: [entry, ...(ctx.history || [])].slice(0, 50),
    statusPin: { status: 'won', stage: 4, at: now, journeyStage: null },
    signupWonAt: now,
  };
}
