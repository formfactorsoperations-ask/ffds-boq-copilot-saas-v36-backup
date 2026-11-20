/* The line plan's room labels (components/playground/linePlan): names and sizes as the mockup prints them. */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { planDim, roomDims, openingSize, LinePlanLabels, LinePlanRooms, LinePlanTitle } from '../../components/playground/linePlan';

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

  it('centres an untagged room’s name, as the mockup names an empty passage', () => {
    const { container } = render(<svg><LinePlanLabels tagClearance={1.2} tagged={n => n !== 'Passage'} rooms={[
      { name: 'Passage', plan: { x: 0, y: 0, w: 12, h: 4 } },
    ]} /></svg>);
    expect(container.querySelector('[data-room-label="Passage"]')?.textContent).toBe('PASSAGE');
  });
});

describe('doors, windows and the title block, as the mockup draws them', () => {
  it('prints a door’s and a window’s width to the nearest 3 inches', () => {
    expect(openingSize({ kind: 'door', w: 2.62 })).toBe(`D 2'-6"`);
    expect(openingSize({ kind: 'window', w: 4.4 })).toBe(`W 4'-6"`);
  });

  it('draws hatched outside walls, a door with its swing and size, a window pane with its size', () => {
    const { container } = render(<svg><LinePlanRooms rooms={[
      { name: 'Bedroom', plan: { x: 0, y: 0, w: 10, h: 12 }, openings: [
        { kind: 'door', side: 'right', at: 1, w: 3 },
        { kind: 'window', side: 'top', at: 3, w: 4.5 },
      ] },
    ]} /></svg>);
    expect(container.querySelector('pattern#lp-hatch')).toBeTruthy();
    expect(container.querySelector('rect[fill="url(#lp-hatch)"]')).toBeTruthy();
    const door = container.querySelector('[data-opening="door"]')!;
    expect(door.querySelector('path')?.getAttribute('stroke-dasharray')).toBeNull();
    expect(door.querySelector('[data-opening-size]')?.textContent).toBe(`D 3'-0"`);
    expect(container.querySelector('[data-opening="window"] [data-opening-size]')?.textContent).toBe(`W 4'-6"`);
  });

  it('puts the title block under the plan’s right corner', () => {
    const { container } = render(<svg><LinePlanTitle title="PALACIA · 3-BHK · MUMBAI" sub="LAYOUT PLAN · 936 SQ FT"
      rooms={[{ name: 'Living', plan: { x: 0, y: 0, w: 20, h: 14 } }]} /></svg>);
    const box = container.querySelector('[data-line-plan-title] rect')!;
    expect(Number(box.getAttribute('y'))).toBeGreaterThan(14);
    expect(Number(box.getAttribute('x')) + Number(box.getAttribute('width'))).toBeCloseTo(20.6875, 3);
    expect(container.querySelector('[data-line-plan-title]')?.textContent).toBe('PALACIA · 3-BHK · MUMBAILAYOUT PLAN · 936 SQ FT');
  });
});
