/*
  No amounts on the Projects screens (DESIGN.md "Projects: journey, needs
  you, one list" and "Projects as glass folders").

  services/nextActionEngine puts the amount in a payment step's title for the
  roles that see money ("Collect Execution Advance (₹2,50,000)"), and the
  Projects screens show that title on the Needs-you cards, the preview and
  the folder's flag. Their steps are worked out with hideAmounts, so the
  title carries no amount and no empty brackets, for every role. Runs the
  real engine.
*/
import { describe, it, expect } from 'vitest';
import { getNextActions } from '../../services/nextActionEngine';
import { projectIntel } from '../../lib/projectsJourney';

const project = (stage: number, milestones: any[]) => ({
  id: `p${stage}`,
  lastModified: 1,
  context: { name: 'Pali Bungalow', status: stage >= 5 ? 'execution' : 'won', lifecycle: { stage }, paymentMilestones: milestones },
  tiers: [],
});

const E1 = { id: 'e1', name: 'Execution advance', status: 'invoiced', amount: 250000 };
const D1 = { id: 'd1', name: 'Sign-up', status: 'pending', amount: 50000 };

describe('payment steps on the Projects screens', () => {
  it('the engine still names the amount for an Owner elsewhere', () => {
    const [step] = getNextActions({ project: project(4, [E1]).context }, 'Owner');
    expect(step.title).toMatch(/₹/);
  });

  it('carry no amount and no empty brackets, for every role', () => {
    for (const role of ['Owner', 'Admin', 'Ops Director', 'Super Admin', 'Designer']) {
      for (const p of [project(4, [E1]), project(2, [D1]), project(5, [E1])]) {
        const step = projectIntel([p as any], role).get(p.id)?.action;
        expect(step, `${role} stage ${p.context.lifecycle.stage}`).toBeTruthy();
        expect(step!.title).not.toMatch(/₹|\(\s*\)|\d{2},\d{3}/);
      }
    }
  });
});
