/*
  The Designer's copy of a project carries the design and none of the money:
    npx vitest run designView.test.ts --environment node
  Made-up data only. (The same code was also run over every live project in
  memory on 6 Oct 2026 and nothing priced, banked or tokened survived.)
*/
import { describe, it, expect } from 'vitest';
import { designViewOf, isMoneyKey, scrub } from './functions/src/designViewStrip';

const project = {
  id: 'p1',
  tenantId: 'studio',
  lastModified: 5,
  leadProfile: { behaviouralNotes: 'prefers WhatsApp' },
  timeline: [{ phase: 'Design', weeks: 4 }],
  materials: [{ roomName: 'Kitchen', materials: ['oak'], colorPalette: ['#fff'], unitPrice: 900 }],
  tiers: [{
    id: 't1', name: 'Detailed BOQ v1', executionTotal: 250000, summary: { margin: 0.3 }, projectContext: { secret: 1 },
    boq: [{ id: 'l1', roomId: 'r1', bankId: 'b1', qty: 3, baseRate: 1200, marginOverride: 0.4, rationale: 'Loft' }],
  }],
  context: {
    name: 'Flat 4B', clientName: 'Ms A', location: 'Thane', area: 1100,
    rooms: [{ id: 'r1', name: 'Kitchen', finishes: { laminate: 'Oak', laminateRate: 120 } }],
    floorPlanData: { walls: [{ x: 0, y: 4200 }], takeoff: [{ item: 'Skirting', qty: 40, costPerUnit: 55 }] },
    journeySummary: { total: 34, done: 10 },
    financials: { approvedExecutionValue: 250000, billablePercent: 60, discounts: [] },
    paymentSchedules: [{ stage: 'Advance', percent: 20 }],
    designFee: 50000, engagement: { terms: 'x' }, termsDockets: [{}], proposalContent: 'Total ₹2,50,000',
    documents: { issues: [{ snapshot: { total: 250000 } }] },
    portalAccess: { token: 'p1_secret' }, executionSignoff: { token: 'EX_AGREEMENT_p1_x' },
    portalMoney: { projectValue: 300000 }, boqBaseline: { total: 1 }, adHocItems: [{ materials: 6000, labor: 2000 }],
    onboardingData: { accountNumber: '123456789012', ifscCode: 'HDFC0001234' },
    approvalReceipts: [{ bodyVerbatim: 'ok for 2.5L' }], proposalDecision: { selected: 'premium' },
    materialSelections: [{ item: 'Tile', estimatedTotal: 8250, status: 'confirmed' }],
    projectUpdates: [{ text: 'Site cleared', changes: [{ field: 'rate', oldValue: 1, newValue: 2 }] }],
    history: [{ text: 'Payment of ₹50,000 received' }],
  },
};

const view = designViewOf(project);
const json = JSON.stringify(view);

describe("the Designer's copy", () => {
  it('keeps the design', () => {
    expect(view.context.name).toBe('Flat 4B');
    expect(view.context.rooms[0].finishes.laminate).toBe('Oak');
    expect(view.context.floorPlanData.walls[0].y).toBe(4200);
    expect(view.context.floorPlanData.takeoff[0].qty).toBe(40);
    expect(view.context.journeySummary.total).toBe(34); // a count, not money
    expect(view.context.materialSelections[0].status).toBe('confirmed');
    expect(view.tiers[0].boq[0]).toEqual({ id: 'l1', roomId: 'r1', bankId: 'b1', qty: 3, rationale: 'Loft' });
    expect(view.timeline[0].phase).toBe('Design');
  });

  it('takes out every section that is money, a token or bank details', () => {
    for (const k of ['financials', 'paymentSchedules', 'designFee', 'engagement', 'termsDockets', 'proposalContent',
      'documents', 'portalAccess', 'executionSignoff', 'portalMoney', 'boqBaseline', 'adHocItems', 'onboardingData',
      'approvalReceipts', 'proposalDecision', 'history']) {
      expect(view.context, k).not.toHaveProperty(k);
    }
  });

  it('takes out prices nested inside what is kept', () => {
    expect(view.context.rooms[0].finishes).not.toHaveProperty('laminateRate');
    expect(view.context.floorPlanData.takeoff[0]).not.toHaveProperty('costPerUnit');
    expect(view.context.materialSelections[0]).not.toHaveProperty('estimatedTotal');
    expect(view.materials[0]).not.toHaveProperty('unitPrice');
    expect(view.context.projectUpdates[0].changes[0]).not.toHaveProperty('oldValue');
    expect(view.tiers[0]).not.toHaveProperty('executionTotal');
    expect(view.tiers[0]).not.toHaveProperty('summary');
  });

  it('leaves no amount, token or account number anywhere', () => {
    for (const needle of ['250000', '300000', '2,50,000', 'p1_secret', 'AGREEMENT', '123456789012', 'HDFC0001234', '1200', '2.5L', '50,000']) {
      expect(json, needle).not.toContain(needle);
    }
  });

  it('matches money words whole, not inside other words', () => {
    expect(isMoneyKey('baseRate')).toBe(true);
    expect(isMoneyKey('marginOverride')).toBe(true);
    expect(isMoneyKey('design_fee')).toBe(true);
    expect(isMoneyKey('handoverSignoff')).toBe(true);
    expect(isMoneyKey('feedback')).toBe(false);
    expect(isMoneyKey('separate')).toBe(false);
    expect(isMoneyKey('span')).toBe(false);
    expect(isMoneyKey('totalArea')).toBe(false);
    expect(scrub({ a: [{ price: 1, name: 'x' }] })).toEqual({ a: [{ name: 'x' }] });
  });
});
