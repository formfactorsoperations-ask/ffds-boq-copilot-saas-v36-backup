import { describe, it, expect } from 'vitest';
import { clientStageFromJourney } from '../../lib/clientStages';
import { calculateClientLifecycleStages } from '../../services/clientPortalEngine';
import { buildPortalView } from '../../lib/portalProjection';
import { buildProgramme } from '../../components/client/programme';

/*
  Palacia: marked Won, the Ops Matrix at 12% with Space Planning not yet
  approved, a design booking paid. The portal printed its first three stages
  as complete and a programme nobody had built.
*/
const ticked = ['discovery_scheduled', 'discovery_completed', 'brief_frozen', 'space_planning_presented'];
const palacia: any = {
  name: 'Palacia - 3BHK',
  status: 'won',
  rooms: [{ id: 'r1', name: 'Kitchen' }],
  paymentMilestones: [{ id: 'd1', type: 'design', name: 'Booking', status: 'paid', percentage: 10 }],
  journeySummary: { done: 4, total: 34, pct: 12, active: 1, phaseProgress: [], doneSteps: ticked },
};

const statuses = (ctx: any) => calculateClientLifecycleStages(ctx).stages.map((s) => s.status);

describe('the client stage, read from the Ops Matrix', () => {
  it('stands at the first stage with a step still open', () => {
    expect(clientStageFromJourney(palacia)?.stage).toBe(2);
  });

  it('marks complete only the stages whose steps are all ticked', () => {
    expect(statuses(palacia)).toEqual(['completed', 'active', 'pending', 'pending', 'pending', 'pending']);
  });

  it('measures the current stage by its own steps', () => {
    const active = calculateClientLifecycleStages(palacia).stages.find((s) => s.status === 'active');
    // Scope & Terms: space planning presented of presented, approved and the terms docket.
    expect(active?.progressPercent).toBe(33);
  });

  it('is unknown, not stage 1, where the matrix has published nothing', () => {
    expect(clientStageFromJourney({ status: 'won' })).toBeNull();
  });

  it('reaches handover only when every step is done', () => {
    const all = clientStageFromJourney({ journeySummary: { doneSteps: [] } })!;
    const every = Object.values(all.perStage).reduce((n, p) => n + p.total, 0);
    expect(every).toBe(34);
  });

  it('counts the design-only steps for a design-only project', () => {
    const r = clientStageFromJourney({ engagementType: 'design_only', journeySummary: { doneSteps: [] } })!;
    expect(r.perStage[4].total).toBeGreaterThan(0);
    expect(r.perStage[6].total).toBeGreaterThan(0);
  });
});

describe('without the Ops Matrix', () => {
  it('does not read Won as the design being done', () => {
    const { journeySummary, ...old } = palacia;
    // The paid design booking is evidence of stage 3, nothing more.
    expect(statuses(old).filter((s) => s === 'completed')).toHaveLength(2);
  });

  it('still trusts a status that is evidence in itself', () => {
    expect(calculateClientLifecycleStages({ status: 'execution' } as any).currentStageNumber).toBe(5);
  });
});

describe("the client's copy", () => {
  it('carries the ticked steps, so the client sees the same stages', () => {
    const view: any = buildPortalView('p1', palacia);
    expect(view.context.journeySummary).toEqual({ pct: 12, doneSteps: ticked });
    expect(calculateClientLifecycleStages(view.context).currentStageNumber).toBe(2);
  });

  it('marks a programme as saved only when one was sent', () => {
    expect((buildPortalView('p1', palacia) as any).context.clientScheduleSaved).toBeUndefined();
    const saved: any = { tasks: [{ id: 't1', title: 'Civil', kind: 'execution', dependencies: [], workDays: 5, status: 'pending' }], holds: [] };
    expect((buildPortalView('p1', palacia, undefined, undefined, undefined, undefined, undefined, saved) as any).context.clientScheduleSaved).toBe(true);
  });

  it('draws no dates when no programme was saved', () => {
    const p = buildProgramme(null, calculateClientLifecycleStages(palacia));
    expect(p.dated).toBe(false);
  });
});
