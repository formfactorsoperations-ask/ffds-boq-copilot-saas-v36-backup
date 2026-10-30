/*
  What the execution agreement states, and that the studio's edits reach the
  client's copy.

  On Unique Vistas the agreement read "GST (0%)" over both fees, ignored the
  discount in Money, printed "Client Address" for the project address, listed
  "Name 2 / Role / Email / Mobile" as a representative and "Details missing
  from bank" under every BOQ line whose bank item had moved.
*/
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import {
  approvedOption,
  agreementBoqLines,
  agreementFromLegacySnapshot,
  agreementMoney,
  agreementParties,
  resolveAgreement,
} from '../../lib/executionAgreement';
import { computeSchedule } from '../../lib/paymentSchedule';
import { agreementScope, buildSnapshot } from '../../services/documentReleaseEngine';
import { bankSpecForLine } from '../../lib/bankSpecs';
import ExecutionAgreementSheet from '../../components/documents/ExecutionAgreementSheet';

afterEach(cleanup);

const ctx: any = {
  name: 'Unique Vistas',
  location: 'Thane',
  config: '2-BHK',
  area: 950,
  clientName: 'Mr Prasad & Mrs Mrunal Naik',
  clientEmail: 'naikprasadu@gmail.com',
  clientPhone: '+918422915959',
  clientContacts: [{ id: 'c1', name: 'Mrs Mrunal Naik', role: 'Wife', email: 'mrunal@x.in', phone: '' }],
  approvedTierId: 't1',
  gstRate: 18,
  financials: {
    approvedExecutionValue: 2430121,
    approvedDesignValue: 169492,
    executionGstEnabled: true,
    designGstEnabled: true,
    billablePercent: 30,
    discounts: [{ name: 'Festive', type: 'fixed', value: 30121, target: 'execution' }],
  },
  paymentMilestones: [
    { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 25, trigger: 'On acceptance of proposal', unlocks: 'Site study' },
    { id: 'd2', type: 'design', name: 'Design Completion', percentage: 75 },
    { id: 'e1', type: 'execution', name: 'Material Order Advance (Gross)', percentage: 40 },
    { id: 'e2', type: 'execution', name: 'Handover', percentage: 60 },
  ],
  /* What the old page left behind: these must no longer win. */
  executionAgreementOverrides: { executionTotal: 100, designFee: 50, gstRate: 0, advances: [{ label: 'Old', percentage: 100 }] },
};

describe('the money is Money\'s', () => {
  it('states the discount, execution GST on the billable share and design GST', () => {
    const { money } = agreementMoney(ctx, undefined);
    expect(money.grossExecution).toBe(2430121);
    expect(money.executionDiscount).toBe(30121);
    expect(money.executionDiscountLabel).toBe('Festive');
    expect(money.netExecution).toBe(2400000);
    expect(money.netDesign).toBe(169492);
    expect(money.executionGst).toBe(Math.round(2400000 * 0.3 * 0.18));
    expect(money.designGst).toBe(Math.round(169492 * 0.18));
    const totals = computeSchedule({ context: ctx }).totals;
    expect(money.grandTotal).toBe(Math.round(totals.grossProjectValue));
  });

  it('ignores the stale figures the old page saved', () => {
    const { money, schedule } = agreementMoney(ctx, undefined);
    expect(money.grossExecution).not.toBe(100);
    expect(money.gstRate).toBe(18);
    expect(schedule.map((r) => r.name)).not.toContain('Old');
  });

  it('a figure the studio types wins, and the schedule follows it', () => {
    const edited = { ...ctx, executionAgreementOverrides: { executionValueOverride: 2000000 } };
    const { money, schedule } = agreementMoney(edited, undefined);
    expect(money.executionManual).toBe(true);
    expect(money.netExecution).toBe(2000000 - 30121);
    const exec = schedule.filter((r) => r.phase === 'execution').reduce((s, r) => s + r.amount, 0);
    expect(Math.abs(exec - money.netExecution)).toBeLessThanOrEqual(1);
  });

  it('switched-off GST reads zero', () => {
    const off = { ...ctx, financials: { ...ctx.financials, executionGstEnabled: false, designGstEnabled: false } };
    const { money } = agreementMoney(off, undefined);
    expect(money.executionGst).toBe(0);
    expect(money.designGst).toBe(0);
    expect(money.grandTotal).toBe(money.netExecution + money.netDesign);
  });
});

describe('Annexure A is the milestones as Money bills them', () => {
  it('one row per milestone, amounts adding up to the contract, wording editable', () => {
    const withWords = { ...ctx, executionAgreementOverrides: { scheduleText: { e1: { unlocks: 'Procurement' } } } };
    const { money, schedule } = agreementMoney(withWords, undefined);
    expect(schedule.map((r) => r.key)).toEqual(['d1', 'd2', 'e1', 'e2']);
    expect(schedule[0].trigger).toBe('On acceptance of proposal');
    expect(schedule[2].name).toBe('Material Order Advance');
    expect(schedule[2].unlocks).toBe('Procurement');
    const design = schedule.filter((r) => r.phase === 'design').reduce((s, r) => s + r.amount, 0);
    expect(Math.abs(design - money.netDesign)).toBeLessThanOrEqual(1);
  });
});

describe('the people and the place', () => {
  it('the project address falls back to the location, and an edit wins', () => {
    expect(agreementParties(ctx).projectAddress).toBe('Thane');
    expect(agreementParties({ ...ctx, executionAgreementOverrides: { projectAddress: 'A-1203, Lodha Amara, Thane' } }).projectAddress)
      .toBe('A-1203, Lodha Amara, Thane');
  });
  it('the representatives are everyone on the client\'s side, no placeholder row', () => {
    const a = resolveAgreement(ctx, { studioName: 'FFDS' });
    expect(a.reps.map((r) => [r.name, r.role])).toEqual([
      ['Mr Prasad & Mrs Mrunal Naik', 'Client'],
      ['Mrs Mrunal Naik', 'Wife'],
    ]);
  });
});

describe('Annexure F', () => {
  it('never prints a placeholder as a description; the studio\'s wording wins', () => {
    const lines = [
      { id: 'l1', name: 'New main door', room: 'Entrance', qty: 37.5, unitCost: 2160, finalCost: 81000, specs: 'Details missing from bank' },
      { id: 'l2', name: 'Panelling', room: 'Entrance', qty: 22.5, unitCost: 1440, finalCost: 32400, specs: '' },
    ];
    expect(agreementBoqLines(lines, ctx).map((l) => l.spec)).toEqual(['', '']);
    const edited = agreementBoqLines(lines, { ...ctx, executionAgreementOverrides: { specs: { l1: 'Teak frame, 40mm flush shutter' } } });
    expect(edited[0].spec).toBe('Teak frame, 40mm flush shutter');
  });
});

describe('the client\'s copy', () => {
  it('freezes the same agreement the studio sees, clauses included', () => {
    const withClause = {
      ...ctx,
      executionAgreementOverrides: {
        clauses: { '4': [{ id: 'x', heading: 'Late fees', text: 'As below.', subClauses: [{ id: 's', text: 'Two percent a month.' }] }] },
      },
    };
    const snap = buildSnapshot('execution_agreement', withClause, { tiers: [], bank: [] } as any, { orgName: 'FFDS' });
    const studio = resolveAgreement(withClause, {
      tierSummary: { totalSell: 2430121, designFee: 169492 },
      studioName: 'FFDS',
    });
    expect(snap.agreement.money).toEqual(studio.money);
    expect(snap.agreement.clauses['4'][0].heading).toBe('Late fees');
    expect(snap.grandTotal).toBe(studio.money.grandTotal);
  });

  it('renders added clauses numbered on from the article', () => {
    const a = resolveAgreement({
      ...ctx,
      executionAgreementOverrides: {
        clauses: { '4': [{ id: 'x', heading: 'Late fees', text: 'As below.', subClauses: [{ id: 's', text: 'Two percent a month.' }] }] },
      },
    }, { studioName: 'FFDS' });
    render(<ExecutionAgreementSheet agreement={a} studioName="FFDS" />);
    expect(screen.getByText('4.7 Late fees')).toBeTruthy();
    expect(screen.getByText('4.7.1')).toBeTruthy();
    expect(screen.queryByText('Name 2')).toBeNull();
    expect(screen.getByText(/Less: Discount on Execution/)).toBeTruthy();
  });

  it('edits go back as overrides; a clause can be added', () => {
    const a = resolveAgreement(ctx, { studioName: 'FFDS' });
    const updates: any[] = [];
    render(<ExecutionAgreementSheet agreement={a} studioName="FFDS" isEditMode onChange={(u) => updates.push(u)} />);
    fireEvent.change(screen.getByLabelText('Project address'), { target: { value: 'A-1203, Lodha Amara' } });
    expect(updates[0]).toEqual({ projectAddress: 'A-1203, Lodha Amara' });
    fireEvent.click(screen.getByText('Add clause 2.8 to Article 2'));
    const added = updates[1]({});
    expect(added.clauses['2']).toHaveLength(1);
  });

  it('an agreement issued before keeps the figures it was issued with', () => {
    const a = agreementFromLegacySnapshot({
      clientName: 'Rao', projectName: 'Harmony', designFee: 100000, executionTotal: 1000000, gstAmount: 0, gstRate: 18, grandTotal: 1100000,
      allAdvances: [{ label: 'E1', phase: 'execution', percentage: 50, amount: 500000, dueCondition: 'Start' }],
    }, 'FFDS');
    expect(a.money.grandTotal).toBe(1100000);
    expect(a.schedule[0]).toMatchObject({ name: 'E1', amount: 500000, gst: 0 });
  });
});

describe('the approved option and the item bank', () => {
  const bank: any[] = [
    { id: 'door', name: 'New main door (double) with security door features', cat: 'Entrance', unit: 'sqft', materials: 1000, labor: 0, margin: 25, specs: 'Teak frame, 40mm flush shutter, digital lock' },
    { id: 'panel', name: 'Panelling', cat: 'Entrance', unit: 'sqft', materials: 1000, labor: 0, margin: 25, specs: 'Details missing from bank' },
  ];
  const bankMap = new Map(bank.map((i) => [i.id, i]));

  it('finds a line\'s spec by its bank item, else by the same name; never a placeholder', () => {
    expect(bankSpecForLine({ bankId: 'door' }, bankMap, bank)).toBe('Teak frame, 40mm flush shutter, digital lock');
    expect(bankSpecForLine({ bankId: 'gone', name: 'NEW MAIN DOOR (DOUBLE) WITH SECURITY DOOR FEATURES' }, bankMap, bank))
      .toBe('Teak frame, 40mm flush shutter, digital lock');
    expect(bankSpecForLine({ bankId: 'panel' }, bankMap, bank)).toBe('');
  });

  it('Annexure F of a signed BOQ takes its descriptions from the bank', () => {
    const signed: any = {
      ...ctx,
      scopeFlow: { enabled: true },
      documents: { issues: [{
        kind: 'detailed_boq', version: 2, reference: 'FFDS-BQ-2026-UV-v2', recordedApproval: { at: 1 },
        snapshot: { tierId: 'rev1', total: 81000, rooms: [{ name: 'Entrance', lines: [
          { id: 'l1', name: 'New main door (double) with security door features', unit: 'sq ft', qty: 37.5, rate: 2160, amount: 81000 },
        ] }] },
      }] },
    };
    const tiers = [{ id: 'rev1', name: 'Detailed BOQ v2', boq: [{ id: 'l1', bankId: 'imported-123', name: 'NEW MAIN DOOR (DOUBLE) WITH SECURITY DOOR FEATURES', qty: 37.5 }] }];
    const scope = agreementScope(signed, { tiers, bank } as any);
    expect(scope.lines[0].specs).toBe('Teak frame, 40mm flush shutter, digital lock');
  });

  it('the agreement states the approved option, priced with Money\'s discounts, GST and milestones', () => {
    const option = approvedOption({ ...ctx, approvedTierId: 'rev1' }, [
      { id: 'rev1', name: 'Detailed BOQ v2 · Scope Revision 1', boq: [], summary: { totalSell: 2285121, designFee: 169492 } },
    ]);
    expect(option).toMatchObject({ execution: 2285121, design: 169492 });
    const { money, schedule } = agreementMoney(ctx, undefined, {}, option);
    expect(money.grossExecution).toBe(2285121);
    expect(money.netExecution).toBe(2285121 - 30121);
    expect(money.moneyExecution).toBe(2430121);
    expect(money.optionName).toBe('Detailed BOQ v2 · Scope Revision 1');
    const exec = schedule.filter((r) => r.phase === 'execution').reduce((s, r) => s + r.amount, 0);
    expect(Math.abs(exec - money.netExecution)).toBeLessThanOrEqual(1);
  });

  it('an option without a summary is priced from its BOQ as Pricing & Tiers prices it', () => {
    const option = approvedOption({ approvedTierId: 't', designFee: 10 }, [
      { id: 't', name: 'Option A', boq: [{ id: 'a', bankId: 'door', qty: 10 }] },
    ], bank);
    expect(option!.execution).toBeGreaterThan(0);
    expect(option!.design).toBeCloseTo(option!.execution * 0.1, 0);
  });
});
