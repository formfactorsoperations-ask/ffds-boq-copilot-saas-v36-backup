/*
  Drawing on the plan (BOQ Playground PR 3b), driven the way a person drives it.

  jsdom has no layout, so the board is given a size on screen: 10 px a foot,
  with the view starting 2 ft above and left of the rooms.
*/
import React, { useMemo, useState } from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const org = { playground: true };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', playground: org.playground }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../services/geminiService', () => ({ estimateQuantity: vi.fn(), isAiAvailable: () => false, refineItemSpecs: vi.fn(), generateLumpsumBreakdown: vi.fn(), readPlanBoxes: vi.fn() }));
vi.mock('../../services/planImage', () => ({ planImageFromFile: vi.fn(), planImageFromUrl: vi.fn(), storePlanImage: vi.fn(), planBase64FromUrl: vi.fn() }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import PlanBoard, { boardStats } from '../../components/playground/PlanBoard';
import StudioDashboard from '../../components/StudioDashboard';
import { buildBankMap } from '../../lib/boqPricing';
import { PLAYGROUND_PRICING } from '../../lib/playground/pricing';

const bank: any[] = [
  { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Laminate', materials: 1500, labor: 400, margin: 25 },
  { id: 'bed', name: 'Queen bed with storage', cat: 'Furniture', unit: 'nos', specs: 'Upholstered', materials: 38000, labor: 0, margin: 20 },
  { id: 'paint', name: 'Wall painting', cat: 'Painting', unit: 'sq ft', specs: 'Emulsion', materials: 18, labor: 6, margin: 25 },
];
const rooms: any[] = [
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } },
  { name: 'Kitchen', size: 80, unit: 'sq ft', plan: { x: 12, y: 0, w: 10, h: 8 } },
];
// View: x -2..24, y -2..12 → 26 × 14 ft, drawn at 260 × 140 px.
const px = (x: number, y: number) => ({ clientX: (x + 2) * 10, clientY: (y + 2) * 10 });

const wardrobe = { id: 'a', bankId: 'w', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft' as const, place: { x: 3.12, y: 1.12, rot: 0, depthFt: 2 } };

function Board({ start, readOnly = false, probe }: { start: any[]; readOnly?: boolean; probe?: (b: any[]) => void }) {
  const [boq, setBoq] = useState<any[]>(start);
  const bankMap = useMemo(() => buildBankMap(bank), []);
  probe?.(boq);
  let n = 0;
  return <PlanBoard projectContext={{ rooms } as any} tier={{ id: 't', boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, boq } as any}
    bank={bank} bankMap={bankMap} readOnly={readOnly} onBoq={setBoq} newId={() => `new${++n}`} />;
}

/* jsdom has no PointerEvent or DragEvent, so their positions would be lost: both are mouse events here. */
if (typeof (window as any).PointerEvent === 'undefined') {
  (window as any).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: any = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
}
if (typeof (window as any).DragEvent === 'undefined') {
  (window as any).DragEvent = class extends MouseEvent {
    dataTransfer: any;
    constructor(type: string, init: any = {}) { super(type, init); this.dataTransfer = init.dataTransfer ?? null; }
  };
}

const board = () => screen.getByRole('application', { name: 'The plan, with its pieces' });
const pieceEl = (name: string) => screen.getAllByLabelText(new RegExp(`^${name},`))[0];

beforeEach(() => {
  org.playground = true;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.getAttribute('role') === 'application'
      ? ({ left: 0, top: 0, width: 260, height: 140, right: 260, bottom: 140, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
      : ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/* Each step on its own, as a person makes them: down, move (a frame passes), up. */
const dragFrom = async (el: Element, from: [number, number], to: [number, number], opts: any = {}) => {
  fireEvent.pointerDown(el, { ...px(...from), pointerId: 1, ...opts });
  fireEvent.pointerMove(board(), { ...px(...to), pointerId: 1, ...opts });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  fireEvent.pointerUp(board(), { ...px(...to), pointerId: 1, ...opts });
};

describe('adding from the library', () => {
  it('dropping an item on a room writes a placed, priced line there', () => {
    let latest: any[] = [];
    render(<Board start={[]} probe={b => { latest = b; }} />);
    fireEvent.drop(board(), { ...px(11.5, 6), dataTransfer: { getData: () => 'w', dropEffect: 'copy' } });
    expect(latest.length).toBe(1);
    expect(latest[0]).toMatchObject({ bankId: 'w', roomId: 'Bedroom', qty: 42, calcLength: 6, calcWidth: 7 });
    // Dropped near the Bedroom's right wall (x 12), so it is backed onto it.
    expect(latest[0].place).toMatchObject({ rot: 90, x: 10.88 });
  });

  it('the typed route: Add puts it along a free wall of the chosen room', () => {
    let latest: any[] = [];
    render(<Board start={[]} probe={b => { latest = b; }} />);
    fireEvent.change(screen.getByLabelText('Add to'), { target: { value: 'Kitchen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Sliding wardrobe to Kitchen' }));
    expect(latest[0]).toMatchObject({ roomId: 'Kitchen', place: { x: 15.12, y: 1.12, rot: 0 } });
    expect(screen.getByRole('status').textContent).toContain('added to Kitchen');
  });

  it('only items that draw are in the library', () => {
    render(<Board start={[]} />);
    expect(screen.getByRole('button', { name: /Add Sliding wardrobe/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add Wall painting/ })).toBeNull();
  });
});

describe('drawing', () => {
  it('a drag writes place', async () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} probe={b => { latest = b; }} />);
    await dragFrom(pieceEl('Sliding wardrobe'), [3.12, 1.12], [6, 5], { altKey: true });
    expect(latest[0].place.x).toBeCloseTo(6, 1);
    expect(latest[0].place.y).toBeCloseTo(5, 1);
    expect(latest[0].qty).toBe(42);
  });

  it('a drag into another room moves the line to it', async () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} probe={b => { latest = b; }} />);
    await dragFrom(pieceEl('Sliding wardrobe'), [3.12, 1.12], [17, 1.5]);
    expect(latest[0].roomId).toBe('Kitchen');
    expect(screen.getByRole('status').textContent).toContain('Moved to Kitchen');
  });

  it('an edge drag writes calcLength and the quantity follows', async () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} probe={b => { latest = b; }} />);
    fireEvent.pointerDown(pieceEl('Sliding wardrobe'), { ...px(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(board(), { ...px(3.12, 1.12), pointerId: 1 });
    await dragFrom(screen.getByLabelText('Resize from the right'), [6.12, 1.12], [8.12, 1.12]);
    expect(latest[0]).toMatchObject({ calcLength: 8, calcWidth: 7, qty: 56 });
  });

  it('the inspector takes the size and place as numbers', () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} probe={b => { latest = b; }} />);
    fireEvent.pointerDown(pieceEl('Sliding wardrobe'), { ...px(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(board(), { ...px(3.12, 1.12), pointerId: 1 });
    const w = screen.getByLabelText('Width (ft)');
    fireEvent.change(w, { target: { value: '7' } });
    fireEvent.blur(w);
    expect(latest[0]).toMatchObject({ calcLength: 7, qty: 49 });
    const x = screen.getByLabelText('From left (ft)');
    fireEvent.change(x, { target: { value: '4' } });
    fireEvent.blur(x);
    expect(latest[0].place.x).toBe(4);
  });

  it('keys nudge, turn and delete; undo puts each back', () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} probe={b => { latest = b; }} />);
    fireEvent.pointerDown(pieceEl('Sliding wardrobe'), { ...px(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(board(), { ...px(3.12, 1.12), pointerId: 1 });
    fireEvent.keyDown(board(), { key: 'ArrowRight' });
    expect(latest[0].place.x).toBe(3.37);
    fireEvent.keyDown(board(), { key: 'r' });
    expect(latest[0].place.rot).toBe(90);
    fireEvent.keyDown(board(), { key: 'Delete' });
    expect(latest.length).toBe(0);
    fireEvent.keyDown(board(), { key: 'z', ctrlKey: true });
    expect(latest.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0].place.rot).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0].place.x).toBe(3.12);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(latest[0].place.x).toBe(3.37);
  });
});

describe('issues, Live BOQ and Needs a place', () => {
  it('flags overlapping pieces', () => {
    render(<Board start={[wardrobe, { ...wardrobe, id: 'b', place: { ...wardrobe.place, x: 5 } }]} />);
    expect(screen.getByText('2 overlaps or past a wall')).toBeTruthy();
  });

  it('prices what is on the plan, by room, as the client is charged', () => {
    render(<Board start={[wardrobe]} />);
    // (1500 + 400) × 1.25 × 42 = 99,750 → 99,800.
    expect(screen.getAllByText('₹ 99,800').length).toBeGreaterThan(0);
  });

  it('places a line that draws but has no place', () => {
    let latest: any[] = [];
    render(<Board start={[{ id: 'q', bankId: 'bed', qty: 1, roomId: 'Bedroom' }]} probe={b => { latest = b; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Queen bed with storage · Bedroom/ }));
    expect(latest[0].place).toBeTruthy();
  });
});

describe('a frozen or signed BOQ', () => {
  it('cannot be dragged, and has no library', async () => {
    let latest: any[] = [];
    render(<Board start={[wardrobe]} readOnly probe={b => { latest = b; }} />);
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.queryByLabelText('Find an item to draw')).toBeNull();
    await dragFrom(pieceEl('Sliding wardrobe'), [3.12, 1.12], [6, 5]);
    expect(latest[0].place.x).toBe(3.12);
    fireEvent.drop(board(), { ...px(6, 6), dataTransfer: { getData: () => 'w' } });
    expect(latest.length).toBe(1);
  });
});

describe('speed', () => {
  it('a drag redraws the dragged piece, not the other 150', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `p${i}`, bankId: 'bed', qty: 1, roomId: 'Bedroom', place: { x: 1 + (i % 10), y: 1 + Math.floor(i / 10) * 0.5, rot: 0, depthFt: 0.3, widthFt: 0.5 } }));
    render(<Board start={[wardrobe, ...many]} />);
    const before = boardStats.pieceRenders;
    fireEvent.pointerDown(pieceEl('Sliding wardrobe'), { ...px(3.12, 1.12), pointerId: 1 });
    for (let i = 1; i <= 10; i++) {
      fireEvent.pointerMove(board(), { ...px(3.12 + i * 0.2, 1.12), pointerId: 1, altKey: true });
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    }
    const during = boardStats.pieceRenders - before;
    // The pointer-down selects the piece (one redraw of it), then each frame redraws only it.
    expect(during).toBeLessThan(30);
  });
});

describe('in the BOQ Editor: one BOQ across the lenses', () => {
  function Editor({ probe }: { probe?: (t: any[]) => void }) {
    const [tiers, setTiers] = useState<any[]>([{ id: 't1', name: 'Comfort', timestamp: 1, boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, boq: [wardrobe] }]);
    const [ctx, setCtx] = useState<any>({ name: 'Flat', area: 200, rooms });
    probe?.(tiers);
    const calc = tiers.map(t => ({ ...t, summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: t.boq.length, designFee: 0, totalRevenue: 0, blendedGm: 0 } }));
    return <StudioDashboard projectContext={ctx} setProjectContext={setCtx} tiers={calc} setTiers={setTiers as any} activeTierId="t1"
      bank={bank} aiStrategy={'balanced' as any} onViewInBank={() => undefined} onSaveProject={vi.fn(async () => undefined)} projectId="" />;
  }

  it('a piece added on the plan is a line in the Sheet; a size typed in the Sheet resizes the piece', () => {
    let latest: any[] = [];
    render(<Editor probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('radio', { name: /Plan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Queen bed with storage to Bedroom' }));
    expect(latest[0].boq.length).toBe(2);
    fireEvent.click(screen.getByRole('radio', { name: /Sheet/ }));
    expect(screen.getAllByText('Queen bed with storage').length).toBeGreaterThan(0);
    const cell = screen.getAllByRole('textbox', { name: 'Size' })[0];
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: '8 x 7' } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole('radio', { name: /Plan/ }));
    expect(screen.getByLabelText(/^Sliding wardrobe, 8′ wide/)).toBeTruthy();
  });
});
