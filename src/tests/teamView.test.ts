/*
  The Client Relations and Site Supervisor copies of a project, and the
  Supervisor's site actions. Made-up data only.
*/
import { describe, it, expect } from 'vitest';
import { opsViewOf, siteViewOf, clientMoneyOf } from '../../functions/src/teamViewStrip';
import { applySiteAction } from '../../functions/src/siteActionPatch';
import { supervisorEmails } from '../../functions/src/teamView';

const project: any = {
  id: 'p1',
  tenantId: 'studio',
  activeTierId: 't1',
  tiers: [{ id: 't1', name: 'v1', summary: { totalSell: 1000000, designFee: 100000, margin: 0.31 },
    boq: [{ id: 'l1', qty: 2, baseRate: 900, marginOverride: 0.4 }] }],
  context: {
    name: 'Kapoor Villa', clientName: 'Mrs Kapoor', clientPhone: '98200 00000', status: 'execution',
    assignedSupervisors: ['m7'],
    financials: { approvedExecutionValue: 1000000, billablePercent: 60, discounts: [] },
    paymentMilestones: [
      { id: 'd1', type: 'design', name: 'Design advance', percentage: 50, status: 'paid', invoiceNumber: 'FF-101', invoiceDate: '2026-09-01' },
      { id: 'e1', type: 'execution', name: 'Carpentry stage', percentage: 40, status: 'invoiced', invoiceNumber: 'FF-114', invoiceDate: '2026-10-03', lockedTaxableBase: 400000 },
    ],
    procurement: [{ vendor: 'Ply Co', buyRate: 72 }],
  },
  activeProject: {
    tierId: 't1', status: 'active', budget: 640000, expenses: [{ amount: 9000 }],
    executionData: {
      bundles: [{ id: 'b1', name: 'Kitchen carcass', status: 'active', completionPercentage: 40, cost: 180000 }],
      sofItems: [{ id: 's1', name: 'Hob', status: 'pending', unitPrice: 42000 }],
      blockers: [{ id: 'k1', description: 'Tiles', financialImpact: 12000, resolved: false }],
      updates: [], actions: [], decisions: [],
      procurement: [{ item: 'Ply', rate: 72, margin: 0.2 }],
    },
  },
};

describe('the Client Relations copy', () => {
  const view = opsViewOf(project);
  const json = JSON.stringify(view);

  it('keeps the client and the client-facing money', () => {
    expect(view.context.clientName).toBe('Mrs Kapoor');
    expect(view.clientMoney.milestones.map((m: any) => [m.id, m.status, m.invoiceNumber])).toEqual([
      ['d1', 'paid', 'FF-101'], ['e1', 'invoiced', 'FF-114'],
    ]);
    expect(view.clientMoney.milestones[1].owed).toBeGreaterThan(0);
    expect(view.clientMoney.balanceDue).toBeGreaterThan(0);
  });

  it('drops costs, margins, rates and the billable split', () => {
    for (const word of ['margin', 'baseRate', 'buyRate', 'billablePercent', 'procurement', 'lockedTaxableBase', 'budget', 'expenses']) {
      expect(json, word).not.toContain(word);
    }
  });

  it('has no money when there is no schedule', () => {
    expect(clientMoneyOf({ context: {} })).toBeNull();
  });
});

describe('the Site Supervisor copy', () => {
  const view = siteViewOf(project);
  const json = JSON.stringify(view);

  it('keeps the site work', () => {
    expect(view.activeProject.executionData.bundles[0]).toMatchObject({ id: 'b1', status: 'active', completionPercentage: 40 });
    expect(view.activeProject.executionData.sofItems[0].name).toBe('Hob');
    expect(view.context.assignedSupervisors).toEqual(['m7']);
  });

  it('carries no money at all', () => {
    expect(view).not.toHaveProperty('clientMoney');
    for (const word of ['cost', 'unitPrice', 'financialImpact', 'procurement', 'budget', 'margin', 'paymentMilestones', 'invoice']) {
      expect(json, word).not.toContain(word);
    }
  });

  it('names its Supervisors by email from the team list', () => {
    expect(supervisorEmails(project, [{ id: 'm7', email: ' Suresh@FFDS.in ' }, { id: 'm8', email: 'x@y.z' }])).toEqual(['suresh@ffds.in']);
  });
});

describe("a Site Supervisor's actions", () => {
  it('adds an update, a material note and a blocker, and changes nothing else', () => {
    let next = applySiteAction(project, { type: 'update', text: 'Carcass fixed' }, 'Suresh', 10);
    next = applySiteAction(next, { type: 'material', text: 'Hob arrived' }, 'Suresh', 11);
    next = applySiteAction(next, { type: 'blocker', text: 'Tile choice pending' }, 'Suresh', 12);
    const ex = next.activeProject.executionData;
    expect(ex.updates.map((u: any) => u.text)).toEqual(['[Material Selection] Hob arrived', 'Carcass fixed']);
    expect(ex.blockers[0]).toMatchObject({ description: 'Tile choice pending', resolved: false, raisedBy: 'Suresh' });
    expect(next.context).toEqual(project.context);
    expect(ex.procurement).toEqual(project.activeProject.executionData.procurement);
    expect(next.activeProject.budget).toBe(640000);
  });

  it('sets package progress, a selection status and resolves a blocker', () => {
    let next = applySiteAction(project, { type: 'bundle', bundleId: 'b1', status: 'completed', completionPercentage: 100 }, 'S');
    next = applySiteAction(next, { type: 'sof', itemId: 's1', status: 'delivered' }, 'S');
    next = applySiteAction(next, { type: 'resolveBlocker', blockerId: 'k1' }, 'S');
    const ex = next.activeProject.executionData;
    expect(ex.bundles[0]).toMatchObject({ status: 'completed', completionPercentage: 100, cost: 180000 });
    expect(ex.sofItems[0].status).toBe('delivered');
    expect(ex.blockers[0].resolved).toBe(true);
  });

  it('refuses anything else', () => {
    expect(() => applySiteAction(project, { type: 'update', text: '  ' } as any, 'S')).toThrow(/Write something/);
    expect(() => applySiteAction(project, { type: 'bundle', bundleId: 'b1', status: 'paid', completionPercentage: 5 } as any, 'S')).toThrow(/status/);
    expect(() => applySiteAction(project, { type: 'bundle', bundleId: 'b1', status: 'active', completionPercentage: 140 } as any, 'S')).toThrow(/Progress/);
    expect(() => applySiteAction(project, { type: 'sof', itemId: 'nope', status: 'delivered' } as any, 'S')).toThrow(/found/);
    expect(() => applySiteAction(project, { type: 'setBudget', value: 1 } as any, 'S')).toThrow(/not one/);
  });
});
