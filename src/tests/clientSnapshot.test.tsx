/*
  Classic Digital, Executive Summary (components/client/ClientSnapshot.tsx):
  the commercial summary says which option it is for, and every option is
  compared in the same format.
*/
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import { test, expect, afterEach } from 'vitest';
import ClientSnapshot, { ledgerFor } from '../../components/client/ClientSnapshot';

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Option A', name: 'Essential Elegance', executionTotal: 632324, designFee: 75879 },
  { id: 'b', label: 'Option B', name: 'Comfort Upgrade', executionTotal: 907236, designFee: 90724 },
  { id: 'c', label: 'Option C', name: 'Complete Harmony', executionTotal: 1148407, designFee: 114841 },
];

test('the ledger matches the proposal the studio sent (Essential Elegance, 18% GST)', () => {
  const l = ledgerFor(632324, 75879, [], { rate: 18, billablePercent: 100, executionGst: true, designGst: true });
  expect(Math.round(l.netTaxable)).toBe(708203);
  expect(Math.round(l.gstOnDesign)).toBe(13658);
  expect(Math.round(l.chargedGstOnExecution)).toBe(113818);
  expect(Math.round(l.finalPayable)).toBe(835680);
});

test('discounts and the execution GST waiver flow through the ledger', () => {
  const discounts = [
    { id: 'd1', name: 'Festive', target: 'design', type: 'percentage', value: 10 },
    { id: 'd2', name: 'Loyalty', target: 'execution', type: 'flat', value: 20000 },
  ] as any;
  const l = ledgerFor(100000, 10000, discounts, { rate: 18, billablePercent: 100, executionGst: false, designGst: true });
  expect(l.netTaxable).toBe(80000 + 9000);
  expect(l.chargedGstOnExecution).toBe(0);
  expect(l.potentialGstOnExecution).toBe(14400);
  expect(l.finalPayable).toBe(89000 + 1620);
});

test('the summary is labelled with its option, and all options are compared', () => {
  render(<ClientSnapshot investmentMin={632324} investmentMax={1148407} timelinePhases={[]}
    designFee={75879} executionTotal={632324}
    option={{ label: 'Option A', name: 'Essential Elegance' }} options={options} activeOptionId="a" />);

  expect(screen.getByText('Commercial Summary')).toBeTruthy();
  expect(screen.getByText('Option A · Essential Elegance')).toBeTruthy();
  expect(screen.queryByText('Detailed Commercial Summary')).toBeNull();

  const table = screen.getByRole('table');
  for (const o of options) expect(within(table).getByText(o.name)).toBeTruthy();
  // Same rows as the summary, for every option, and each option's own total.
  expect(within(table).getByText('1. Total Execution Cost (Excl. Loose Furniture)')).toBeTruthy();
  expect(within(table).getByText('Net Taxable Value')).toBeTruthy();
  expect(within(table).getByText(/8,35,680/)).toBeTruthy();
  expect(within(table).getByText(/11,77,593/)).toBeTruthy();
  expect(within(table).getByText(/14,90,633/)).toBeTruthy();

  // The scope is the same in every option, and the studio's carpentry is modular or custom.
  expect(screen.getByText('Included in every option')).toBeTruthy();
  expect(screen.getByText('Modular/Custom Carpentry')).toBeTruthy();
  expect(screen.queryByText('Full Modular Carpentry')).toBeNull();
});

test('with one option there is no comparison table', () => {
  render(<ClientSnapshot investmentMin={1} investmentMax={1} timelinePhases={[]} designFee={10} executionTotal={100}
    option={{ label: 'Approved option', name: 'Comfort Upgrade' }} />);
  expect(screen.getByText('Approved option · Comfort Upgrade')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByText('Included Scope')).toBeTruthy();
});
