import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildPortalView, rebuildAfterClientAction } from '../../lib/portalProjection';
import type { PortalMoney } from '../../lib/portalMoney';

/*
  A client's own action rebuilds their portal copy (submitClientAction), so a
  signature or a confirmation shows at once. It must not also send what the
  studio changed on Money and has not sent: the milestones stay the ones the
  carried money prices.
*/

const sentMilestones = [
  { id: 'm1', type: 'design', name: 'Design advance', trigger: 'On signing', status: 'paid', percentage: 50 },
  { id: 'm2', type: 'design', name: 'Design handover', trigger: 'On drawings', status: 'pending', percentage: 50 },
  { id: 'm3', type: 'execution', name: 'Site mobilisation', trigger: 'On start', status: 'pending', percentage: 40 },
];

const money: PortalMoney = {
  v: 1, gstRate: 18, retainerPaid: 0,
  designBase: 100000, designGst: 18000, designTotal: 118000, designPaid: 59000, designPct: 50,
  executionBase: 500000, executionGst: 90000, executionTotal: 590000, executionPaid: 0, executionPct: 0,
  projectValue: 708000, totalPaid: 59000, balanceDue: 649000,
  milestoneAmounts: { m1: 59000, m2: 59000, m3: 236000 },
};

const sentContext: any = {
  name: 'Asha Home',
  clientName: 'Asha Rao',
  engagementType: 'turnkey',
  paymentMilestones: sentMilestones,
  materialSelections: [{ id: 's1', itemName: 'Oak veneer', status: 'pending_approval', clientVisibility: { state: 'published' } }],
};

/* What the studio sent: projects/{id}/portalView/current. */
const sent = buildPortalView('p1', sentContext, { name: 'FFDS' } as any, undefined, undefined, undefined, money);

/* The studio then reworks the schedule on Money and does not send it. */
const studioNow: any = {
  ...sentContext,
  engagementType: 'design_only',
  paymentMilestones: [
    { id: 'm1', type: 'design', name: 'Design advance', trigger: 'On signing', status: 'paid', percentage: 30 },
    { id: 'm2b', type: 'design', name: 'Concept sign-off', trigger: 'On concept', status: 'pending', percentage: 30 },
    { id: 'm2', type: 'design', name: 'Design handover', trigger: 'On drawings', status: 'invoiced', percentage: 40, invoiceNumber: 'INV-9' },
  ],
};

/* The client confirms a finish -- the patch submitClientAction applies for confirmSelection. */
const confirmSelection = (prev: any) => ({
  ...prev,
  materialSelections: prev.materialSelections.map((m: any) =>
    m.id === 's1' ? { ...m, status: 'approved', clientConfirmedAt: '2026-11-26T10:00:00.000Z' } : m),
});

describe('a client action rebuilds the portal without sending the studio\'s changes', () => {
  const rebuilt = rebuildAfterClientAction('p1', confirmSelection(studioNow), JSON.parse(JSON.stringify(sent)));

  it('leaves the milestones as last sent', () => {
    expect(rebuilt.context.paymentMilestones).toEqual(sent.context.paymentMilestones);
    expect(rebuilt.context.paymentMilestones.map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(rebuilt.context.paymentMilestones.find((m: any) => m.id === 'm2b')).toBeUndefined();
    expect(rebuilt.context.paymentMilestones[1]).toMatchObject({ status: 'pending', percentage: 50 });
    expect(rebuilt.context.paymentMilestones[1].invoiceNumber).toBeUndefined();
  });

  it('keeps the amounts that price them, so every milestone the client sees has its figure', () => {
    expect(rebuilt.context.portalMoney).toEqual(money);
    rebuilt.context.paymentMilestones.forEach((m: any) => {
      expect(rebuilt.context.portalMoney.milestoneAmounts[m.id]).toBeGreaterThan(0);
    });
  });

  it('keeps the engagement type that decides which milestones the portal draws', () => {
    expect(rebuilt.context.engagementType).toBe('turnkey');
    expect(rebuilt.context.paymentMilestones.some((m: any) => m.type === 'execution')).toBe(true);
  });

  it('still shows the client their own action at once', () => {
    expect(rebuilt.context.materialSelections[0]).toMatchObject({ status: 'approved', clientConfirmedAt: '2026-11-26T10:00:00.000Z' });
  });

  it('still carries the rest of what the studio sent', () => {
    expect(rebuilt.context.portalStudio).toEqual(sent.context.portalStudio);
  });

  it('carries nothing new into a copy that held no milestones', () => {
    const bare: any = JSON.parse(JSON.stringify(sent));
    delete bare.context.paymentMilestones;
    delete bare.context.engagementType;
    const r = rebuildAfterClientAction('p1', studioNow, bare);
    expect(r.context.paymentMilestones).toEqual([]);
    expect('engagementType' in r.context).toBe(false);
  });

  it('is what submitClientAction uses', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../functions/src/index.ts'), 'utf8');
    expect(src).toMatch(/rebuildAfterClientAction\(projectId, nextContext, viewSnap\.data\(\)/);
    expect(src).not.toMatch(/buildPortalView\(\s*projectId,\s*nextContext/);
  });
});
