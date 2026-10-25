/*
  Classic Digital, "Detailed Scope Breakdown": picking an option must visibly
  change the scope (components/client/ClientRoomwise.tsx).
*/
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import { test, expect, afterEach } from 'vitest';
import ClientRoomwise from '../../components/client/ClientRoomwise';

afterEach(cleanup);

const item = (id: string, name: string, bankId: string, rate: number, rationale: string, qty = 2) =>
  ({ id, name, bankId, materials: rate, labor: 0, margin: 0, qty, unit: 'sqft', cat: 'Joinery', specs: 'Scope Details', rationale }) as any;

const tiers = [
  { id: 'a', name: 'Essential Elegance', executionTotal: 4000, groupedBoq: {
    Bedroom: [item('a1', 'Wardrobe shutters', 'w', 1000, 'Base spec: 0.8mm laminate, standard hardware')],
  } },
  { id: 'c', name: 'Complete Harmony', executionTotal: 9000, groupedBoq: {
    Bedroom: [
      item('c1', 'Wardrobe shutters', 'w', 1350, 'Top spec: acrylic/PU finish, premium hardware'),
      item('c2', 'Wall panelling', 'p', 3150, 'Top spec: acrylic/PU finish, premium hardware · included at this tier', 1),
    ],
  } },
];

const shown = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.roomwise-content')).filter(s => s.style.display !== 'none');

test('each option shows its own specification and the items only it includes', () => {
  const { container, rerender } = render(<ClientRoomwise tiers={tiers} mode="advisory" activeTierId="a" />);
  let [section] = shown(container);
  expect(within(section).getByText('Base spec: 0.8mm laminate, standard hardware')).toBeTruthy();
  expect(within(section).queryByText('Added in this option')).toBeNull();
  // The placeholder spec of an item without a bank entry is not shown as if it were one.
  expect(within(section).queryByText('Scope Details')).toBeNull();

  rerender(<ClientRoomwise tiers={tiers} mode="advisory" activeTierId="c" />);
  [section] = shown(container);
  expect(within(section).getByText('Top spec: acrylic/PU finish, premium hardware')).toBeTruthy();
  expect(within(section).getByText('Added in this option')).toBeTruthy();
  expect(within(section).getByText('+1 in this option')).toBeTruthy();
  // "included at this tier" is what the badge already says.
  expect(within(section).queryByText(/included at this tier/)).toBeNull();
});

test('prices appear only when the studio shows scope pricing', () => {
  const { container, rerender } = render(<ClientRoomwise tiers={tiers} mode="advisory" activeTierId="c" />);
  expect(within(shown(container)[0]).queryByText('Package value (excl. GST)')).toBeNull();
  expect(within(shown(container)[0]).queryByText(/2,700/)).toBeNull();

  rerender(<ClientRoomwise tiers={tiers} mode="advisory" activeTierId="c" showPricing />);
  const section = shown(container)[0];
  expect(within(section).getByText('Package value (excl. GST)')).toBeTruthy();
  expect(within(section).getByText(/9,000/)).toBeTruthy();   // package
  expect(within(section).getByText(/5,850/)).toBeTruthy();   // room: 2 × 1,350 + 3,150
  expect(within(section).getByText(/2,700/)).toBeTruthy();   // item: 2 × 1,350
});

test('with one option there is nothing to compare, so nothing is marked as added', () => {
  const { container } = render(<ClientRoomwise tiers={[tiers[1]]} mode="advisory" activeTierId="c" />);
  expect(within(shown(container)[0]).queryByText('Added in this option')).toBeNull();
});
