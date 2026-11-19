import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/planImage', () => ({
  planImageFromFile: vi.fn(), planImageFromUrl: vi.fn(), storePlanImage: vi.fn(), planBase64FromUrl: vi.fn(),
}));
vi.mock('../../services/geminiService', () => ({ readPlanBoxes: vi.fn() }));

import PlanSheetPanel from '../../components/playground/PlanSheetPanel';
import type { ProjectContext } from '../../types';

afterEach(cleanup);

function Harness({ start, probe }: { start: Partial<ProjectContext>; probe?: (c: any) => void }) {
  const [ctx, setCtx] = useState<any>(start);
  probe?.(ctx);
  return <PlanSheetPanel projectContext={ctx} setProjectContext={setCtx} tiers={[{ id: 't', boq: [] } as any]} activeTierId="t" bank={[]} />;
}

describe('the plan panel', () => {
  it('offers blocks when there is no plan, and lays every room out', () => {
    let ctx: any;
    render(<Harness start={{ rooms: [{ name: 'Living', size: 182, unit: 'sq ft', length: 14, width: 13 }, { name: 'Bath', size: 28, unit: 'sq ft' }] }} probe={c => { ctx = c; }} />);
    expect(screen.getByText('No plan on this project yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lay out as blocks' }));
    expect(ctx.planSheet).toEqual({ source: 'blocks' });
    expect(ctx.rooms.every((r: any) => r.plan)).toBe(true);
    expect(screen.getByText('2 of 2 on the plan')).toBeTruthy();
  });

  it('shows the brief’s plan, and asks to draw a PDF’s first page', () => {
    render(<Harness start={{ floorplanImageUrl: 'https://x/o/plans%2F1.pdf?alt=media', rooms: [] }} />);
    expect(screen.getByText('The brief’s plan is a PDF')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use page 1' })).toBeTruthy();
  });

  it('places a room by typing its size, with no drawing needed', () => {
    let ctx: any;
    render(<Harness start={{ planSheet: { source: 'blocks' }, rooms: [{ name: 'Study', size: 80, unit: 'sq ft', length: 10, width: 8 }] }} probe={c => { ctx = c; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Place by size' }));
    fireEvent.change(screen.getByLabelText('From left (ft)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the plan' }));
    expect(ctx.rooms[0].plan).toEqual({ x: 3, y: 0, w: 10, h: 8 });
    expect(ctx.rooms[0].size).toBe(80);
  });
});
