import { describe, it, expect } from 'vitest';
import { signupMilestone, shouldWinOnSignup, signupAction, winOnSignup } from '../../lib/signupWon';
import { lastPhaseBehind } from '../../services/journeyEngine';
import { PHASE } from '../../constants/journeyConstants';
import type { ProjectContext } from '../../types';

const ms = (id: string, type: 'design' | 'execution', status: string) =>
  ({ id, type, name: id.toUpperCase(), percentage: 0, description: '', status }) as any;

const ctx = (over: Partial<ProjectContext>): ProjectContext => ({
  name: 'Harmony 704',
  rooms: [],
  status: 'negotiation',
  paymentMilestones: [ms('d1', 'design', 'pending'), ms('d2', 'design', 'pending'), ms('e1', 'execution', 'pending')],
  ...over,
} as ProjectContext);

const paidD1 = [ms('d1', 'design', 'paid'), ms('d2', 'design', 'pending'), ms('e1', 'execution', 'pending')];

describe('the sign-up payment wins the project', () => {
  it('is the first design milestone, or the first milestone with no design fee', () => {
    expect(signupMilestone(ctx({}))?.id).toBe('d1');
    expect(signupMilestone(ctx({ paymentMilestones: [ms('e1', 'execution', 'paid')] }))?.id).toBe('e1');
    expect(signupMilestone(ctx({ paymentMilestones: [] }))).toBeNull();
  });

  it('wins a turnkey project and a design-only one alike', () => {
    expect(shouldWinOnSignup(ctx({ paymentMilestones: paidD1 }))).toBe(true);
    expect(shouldWinOnSignup(ctx({ paymentMilestones: paidD1, engagementType: 'design_only' } as any))).toBe(true);
  });

  it('waits for the payment itself: invoiced is not paid', () => {
    expect(shouldWinOnSignup(ctx({}))).toBe(false);
    expect(shouldWinOnSignup(ctx({ paymentMilestones: [ms('d1', 'design', 'invoiced')] }))).toBe(false);
  });

  it('moves only a project still in the pipeline', () => {
    for (const status of ['lead', 'draft', 'proposal_sent', 'negotiation'] as const) {
      expect(shouldWinOnSignup(ctx({ status, paymentMilestones: paidD1 }))).toBe(true);
    }
    for (const status of ['won', 'execution', 'work_paused', 'completed', 'lost'] as const) {
      expect(shouldWinOnSignup(ctx({ status, paymentMilestones: paidD1 }))).toBe(false);
    }
  });

  it('happens once: moved back by hand, it stays where the studio put it', () => {
    const won = winOnSignup(ctx({ paymentMilestones: paidD1 }), 1000, 'Anita');
    const movedBack = { ...won, status: 'draft' as const, statusPin: { status: 'draft' as const, stage: 2, at: 2000, journeyStage: null } };
    expect(shouldWinOnSignup(movedBack)).toBe(false);
  });

  it('notes a payment on a project already past the pipeline, so moving it back later sticks', () => {
    // The Ops Matrix can win the project on the payment before the app does.
    const wonByMatrix = ctx({ status: 'won', paymentMilestones: paidD1 });
    expect(signupAction(wonByMatrix)).toBe('note');
    expect(signupAction({ ...wonByMatrix, signupWonAt: 5 })).toBeNull();
    expect(signupAction({ ...wonByMatrix, status: 'draft', signupWonAt: 5 })).toBeNull();
    expect(signupAction(ctx({ status: 'won' }))).toBeNull();
  });

  it('is the Won the status window sets: signed up, with the design ahead', () => {
    const won = winOnSignup(ctx({ paymentMilestones: paidD1, lifecycle: { stage: 3 } as any }), 1000, 'Anita');
    expect(won.status).toBe('won');
    expect(won.lifecycle?.stage).toBe(4);
    expect(won.statusPin).toEqual({ status: 'won', stage: 4, at: 1000, journeyStage: null });
    expect(won.history?.[0]).toMatchObject({ actor: 'Anita', summary: 'Status updated from "negotiation" to "won"', detail: 'Sign-up payment received (D1).' });
    // Stage 4 puts Sign-up behind the project, not Design.
    expect(lastPhaseBehind(won.lifecycle!.stage as number)).toBe(PHASE.signup);
  });
});
