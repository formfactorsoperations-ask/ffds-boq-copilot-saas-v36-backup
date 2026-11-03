/*
  Design-only projects (Pali Hill bungalow): FFDS designs, the client hires and
  pays their own contractors. The engagement is stored on the project and read
  by the rail, the journey, Money and the proposal (lib/engagement.ts).
*/
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: {} }) }));

import {
  engagementOf, offeredEngagements, canChangeEngagement, navItemsFor, isRouteHidden,
  journeyStepsFor, phasesFor, gateStepIds, stageLabel, proposalModeFor, isFeeOnly, PMC_AVAILABLE,
} from '../../lib/engagement';
import { JOURNEY_STEPS, PHASES } from '../../constants/journeyConstants';
import { NAV_CONFIG } from '../../components/navConfig';
import { billingBase, billingSummary, computeSchedule } from '../../lib/paymentSchedule';
import { applyEngagement } from '../../components/projects/EngagementPicker';
import { marginOf, type ProjectFact } from '../../lib/ownerReports';

describe('which engagement a project is', () => {
  it('reads nothing stored as turnkey, so existing projects are unchanged', () => {
    expect(engagementOf({})).toBe('turnkey');
    expect(engagementOf(null)).toBe('turnkey');
    expect(engagementOf({ engagementType: 'nonsense' })).toBe('turnkey');
    expect(engagementOf({ engagementType: 'design_only' })).toBe('design_only');
  });

  it('points the proposal at the matching template', () => {
    expect(proposalModeFor('turnkey')).toBe('TURNKEY');
    expect(proposalModeFor('design_only')).toBe('DESIGN_ONLY');
    expect(isFeeOnly('design_only')).toBe(true);
    expect(isFeeOnly('turnkey')).toBe(false);
  });
});

describe('what a studio offers', () => {
  it('defaults to turnkey and design only', () => {
    expect(offeredEngagements({})).toEqual(['turnkey', 'design_only']);
  });

  it('keeps Design + PMC off until its screens exist', () => {
    const offered = offeredEngagements({ engagementTypesOffered: ['turnkey', 'design_only', 'design_pmc'] });
    expect(offered.includes('design_pmc')).toBe(PMC_AVAILABLE);
  });

  it('always offers at least one', () => {
    expect(offeredEngagements({ engagementTypesOffered: [] })).toEqual(['turnkey']);
    expect(offeredEngagements({ engagementTypesOffered: ['design_only'] })).toEqual(['design_only']);
  });
});

describe('changing the engagement', () => {
  it('always lets a design-only project become turnkey', () => {
    const ctx = { engagementType: 'design_only', paymentMilestones: [{ id: 'd1', type: 'design', status: 'paid' }] };
    expect(canChangeEngagement(ctx, 'turnkey')).toEqual({ ok: true, upgrade: true });
  });

  it('blocks stepping down once execution is invoiced', () => {
    const ctx = { paymentMilestones: [{ id: 'e1', type: 'execution', status: 'invoiced' }] };
    const r = canChangeEngagement(ctx, 'design_only');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invoiced/);
  });

  it('blocks stepping down once the execution agreement is out', () => {
    expect(canChangeEngagement({ executionSignoff: { status: 'sent' } }, 'design_only').ok).toBe(false);
  });

  it('allows stepping down before anything is agreed or billed', () => {
    expect(canChangeEngagement({ paymentMilestones: [{ type: 'execution', status: 'pending' }] }, 'design_only').ok).toBe(true);
  });

  it('moves a percentage fee to a rate per sq ft, pre-filled from the studio', () => {
    const next = applyEngagement({ designFeeType: 'percentage', designFee: 10 } as any, 'design_only', { designOnlyFeePerSqft: 150 });
    expect(next.engagementType).toBe('design_only');
    expect(next.activeProposalMode).toBe('DESIGN_ONLY');
    expect(next.designFeeType).toBe('fixed_sqft');
    expect(next.designFee).toBe(150);
  });

  it('leaves a fixed fee alone', () => {
    const next = applyEngagement({ designFeeType: 'fixed_lumpsum', designFee: 400000 } as any, 'design_only', { designOnlyFeePerSqft: 150 });
    expect(next.designFeeType).toBe('fixed_lumpsum');
    expect(next.designFee).toBe(400000);
  });
});

describe('the project rail', () => {
  const routes = (e: any) => NAV_CONFIG.flatMap((s) => navItemsFor(e, s.items)).map((i) => i.route);

  it('is unchanged for turnkey', () => {
    expect(routes('turnkey')).toEqual(NAV_CONFIG.flatMap((s) => s.items).map((i) => i.route));
  });

  it('drops the BOQ, pricing, execution agreement and site screens for design only', () => {
    const r = routes('design_only');
    for (const gone of ['ops', 'boq-editor', 'analytics', 'revision-studio', 'execution-agreement', 'site-ops', 'scope-additions']) {
      expect(r).not.toContain(gone);
    }
    for (const kept of ['leadiq', 'client', 'terms-docket', 'onboarding', 'payment-calc', 'design-gate', 'materials', 'handover-docket']) {
      expect(r).toContain(kept);
    }
    expect(isRouteHidden('design_only', 'site-ops')).toBe(true);
    expect(isRouteHidden('turnkey', 'site-ops')).toBe(false);
  });

  it('names the gate and the handover for the job they do', () => {
    const items = NAV_CONFIG.flatMap((s) => navItemsFor('design_only', s.items));
    expect(items.find((i) => i.route === 'design-gate')?.label).toBe('GFC Release');
    expect(items.find((i) => i.route === 'handover-docket')?.label).toBe('Design Closeout');
    expect(stageLabel('design_only', 6, 'Handover & Closeout')).toBe('Design Closeout');
    expect(stageLabel('turnkey', 6, 'Handover & Closeout')).toBe('Handover & Closeout');
  });
});

describe('the journey for a design-only project', () => {
  const steps = journeyStepsFor('design_only', JOURNEY_STEPS);
  const ids = new Set(steps.map((s) => s.id));

  it('is the turnkey journey untouched for turnkey', () => {
    expect(journeyStepsFor('turnkey', JOURNEY_STEPS)).toBe(JOURNEY_STEPS);
  });

  it('has no execution, BOQ or site steps', () => {
    for (const gone of ['boq_shared', 'agreement_signed', 'exec_advance_1_received', 'contractor_mobilised', 'phase1_work_complete', 'snag_list_shared', 'keys_handed_over', 'warranty_activated']) {
      expect(ids.has(gone)).toBe(false);
    }
    expect(ids.has('gfc_set_issued')).toBe(true);
    expect(ids.has('design_closeout_signed')).toBe(true);
  });

  it('only waits on steps that exist, so nothing is locked for ever', () => {
    for (const s of steps) for (const p of s.prerequisiteIds) expect(ids.has(p)).toBe(true);
  });

  it('keeps onboarding where the dropped execution agreement stood: after the payment schedule', () => {
    // agreement_signed waited on payment_schedule_sent, which waits on the terms docket.
    expect(steps.find((s) => s.id === 'onboarding_kit_sent')?.prerequisiteIds).toEqual(['payment_schedule_sent']);
    expect(steps.find((s) => s.id === 'payment_schedule_sent')?.prerequisiteIds).toEqual(['terms_docket_acknowledged']);
  });

  it('has something in every phase, so every stage can complete', () => {
    for (let i = 0; i < PHASES.length; i++) expect(steps.some((s) => s.phase === i)).toBe(true);
  });

  it('never links a step to a screen the rail hides', () => {
    for (const s of steps) if (s.linkedTab) expect(isRouteHidden('design_only', s.linkedTab)).toBe(false);
  });

  it('numbers the steps in order and names the phases for design work', () => {
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    expect(phasesFor('design_only', PHASES as any)[3].name).toBe('Technical Drawings');
    expect(phasesFor('turnkey', PHASES as any)).toBe(PHASES);
  });

  it('closes the contract and handover gates on the design steps', () => {
    expect(gateStepIds('design_only')).toEqual({ contractSigned: 'terms_docket_acknowledged', handoverComplete: 'design_closeout_signed' });
    expect(gateStepIds('turnkey')).toEqual({ contractSigned: 'agreement_signed', handoverComplete: 'keys_handed_over' });
  });
});

describe('Money on a design-only project', () => {
  // Pali Hill: 2,000 sq ft at ₹150 per sq ft. An old BOQ left ₹12 lakh of execution on the option.
  const option = { totalSell: 1200000, designFee: 120000 };
  const designOnly = {
    engagementType: 'design_only', designFeeType: 'fixed_sqft', designFee: 150, area: 2000,
    paymentMilestones: [
      { id: 'd1', type: 'design', name: 'Retainer', percentage: 50 },
      { id: 'd2', type: 'design', name: 'GFC set', percentage: 50 },
      { id: 'e1', type: 'execution', name: 'Execution advance', percentage: 100 },
    ],
  };

  it('bills no execution and the fee engine’s design fee', () => {
    expect(billingSummary(designOnly, option)).toMatchObject({ totalSell: 0, designFee: 300000 });
    expect(billingBase(designOnly, option, {} as any)).toMatchObject({ execution: 0, design: 300000 });
  });

  it('ignores an execution value stored from when the project was turnkey', () => {
    const accepted = { ...designOnly, approvedTierId: 't1' };
    expect(billingBase(accepted, option, { approvedExecutionValue: 1200000 } as any).execution).toBe(0);
  });

  it('schedules the design milestones only', () => {
    const r = computeSchedule({ context: designOnly, tierSummary: option });
    expect(r.amounts.map((a) => a.id)).toEqual(['d1', 'd2']);
    expect(r.amounts.reduce((s, a) => s + a.base, 0)).toBe(300000);
  });

  it('leaves turnkey billing as it was', () => {
    const turnkey = { ...designOnly, engagementType: undefined };
    expect(billingSummary(turnkey, option)).toBe(option);
    expect(billingBase(turnkey, option, {} as any)).toMatchObject({ execution: 1200000, design: 120000 });
  });
});

describe('reports', () => {
  const fact = (id: string, engagement: any, execution: number, design: number, plannedCost: number, committed: number): ProjectFact => ({
    id, name: id, client: id, status: 'execution', area: 0, bookedAt: null, execution, design, plannedCost, committed,
    milestones: [], additions: [], targetHandoverAt: null, handedOverAt: null, snags: [], decisions: [], schedule: null,
    designers: [], supervisors: [], engagement,
  } as any);

  it('leaves design-only fees out of gross margin', () => {
    const withDesign = marginOf([fact('a', 'turnkey', 1000000, 100000, 800000, 800000), fact('b', 'design_only', 0, 300000, 0, 0)]);
    const turnkeyOnly = marginOf([fact('a', 'turnkey', 1000000, 100000, 800000, 800000)]);
    expect(withDesign.quotedPct).toBe(turnkeyOnly.quotedPct);
    expect(withDesign.contracted).toBe(1);
  });
});
