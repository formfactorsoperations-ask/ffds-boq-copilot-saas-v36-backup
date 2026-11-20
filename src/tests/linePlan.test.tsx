/* The line plan's room labels (components/playground/linePlan): names and sizes as the mockup prints them. */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { planDim, roomDims, LinePlanLabels } from '../../components/playground/linePlan';

describe('room sizes on the line plan', () => {
  it('prints feet and inches as a plan does', () => {
    expect(planDim(13)).toBe(`13'-0"`);
    expect(planDim(7.833)).toBe(`7'-10"`);
    expect(planDim(9.99)).toBe(`10'-0"`);
  });

  it('prints the size the client’s plan printed, across first, else the room as drawn', () => {
    const plan = { x: 0, y: 0, w: 20.5, h: 11.25 };
    expect(roomDims({ name: 'Living', plan, length: 20, width: 11, dimSource: 'read' })).toBe(`20'-0" X 11'-0"`);
    expect(roomDims({ name: 'Living', plan: { ...plan, w: 11.25, h: 20.5 }, length: 20, width: 11, dimSource: 'read' })).toBe(`11'-0" X 20'-0"`);
    expect(roomDims({ name: 'Living', plan, length: 20, width: 11, dimSource: 'calculated' })).toBe(`20'-6" X 11'-3"`);
  });

  it('names a big room with its size, a small one by name, and leaves a sliver to its tag', () => {
    const { container } = render(<svg><LinePlanLabels tagClearance={1.2} rooms={[
      { name: 'Master Bedroom', plan: { x: 0, y: 0, w: 12, h: 12 } },
      { name: 'Store', plan: { x: 12, y: 0, w: 4.5, h: 6 } },
      { name: 'Shaft', plan: { x: 17, y: 0, w: 1.5, h: 2 } },
    ]} /></svg>);
    expect(container.querySelector('[data-room-label="Master Bedroom"]')?.textContent).toBe(`MASTER BEDROOM12'-0" X 12'-0"`);
    expect(container.querySelector('[data-room-label="Store"]')?.textContent).toBe('STORE');
    expect(container.querySelector('[data-room-label="Shaft"]')).toBeNull();
  });
});
