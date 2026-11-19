/*
  The BOQ Playground in the BOQ Editor, with the studio's switch on: the
  approved mockup's one screen, with five lenses (Plan, Rooms, Sheet, Tune,
  Deal), the studio design library and the Live BOQ.

  Each test drives one thing the four old modes did, from its new home, the way
  a person would; and the switch off brings the four modes back as they were.

    Focus Editor  → click any line: the inspector on the right
    Excel         → Sheet (and its full grid, for status, linkage and notes)
    Cards         → Rooms
    Plan Takeoff  → Plan

  jsdom has no layout: the stage keeps its first view, 20 px a foot, the plan's
  top-left corner 40 px right and 60 px down.
*/
import React, { useMemo, useState } from 'react';
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const org = { playground: true, role: 'Super Admin' };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', playground: org.playground }, currentRole: org.role, currentRoles: [org.role], currentUserAuth: { displayName: 'Priya Shah', email: 'priya@example.com' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../services/geminiService', () => ({
  estimateQuantity: vi.fn(), isAiAvailable: () => false, refineItemSpecs: vi.fn(), generateLumpsumBreakdown: vi.fn(), readPlanBoxes: vi.fn(),
}));
vi.mock('../../services/planImage', () => ({ planImageFromFile: vi.fn(), planImageFromUrl: vi.fn(), storePlanImage: vi.fn(), planBase64FromUrl: vi.fn() }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import StudioDashboard from '../../components/StudioDashboard';
import { stageStats } from '../../components/playground/PlanStage';
import { setFiguresHidden } from '../../lib/figuresPrivacy';
import { PLAYGROUND_PRICING, ceilTo } from '../../lib/playground/pricing';

const bank: any[] = [
  { id: 'wardrobe', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Walnut laminate', materials: 1000, labor: 400, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', specs: 'Emulsion', materials: 20, labor: 10, margin: 25 },
  { id: 'counter', name: 'Kitchen counter', cat: 'Modular Kitchen', unit: 'rft', specs: 'Granite', materials: 1500, labor: 500, margin: 10 },
  { id: 'bed', name: 'Queen bed', cat: 'Furniture', unit: 'nos', specs: 'Upholstered', materials: 38000, labor: 0, margin: 20 },
];
const rooms = [
  { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } },
  { name: 'Kitchen', size: 80, unit: 'sq ft', plan: { x: 12, y: 0, w: 10, h: 8 } },
];
const baseBoq = () => [
  { id: 'l1', bankId: 'wardrobe', qty: 40, roomId: 'Bedroom', baseRate: 1000 },
  { id: 'l2', bankId: 'paint', qty: 300, roomId: 'Bedroom' },
  { id: 'l3', bankId: 'counter', qty: 10, roomId: 'Kitchen' },
];
const placedWardrobe = { id: 'p1', bankId: 'wardrobe', qty: 42, roomId: 'Bedroom', calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 3.12, y: 1.12, rot: 0, depthFt: 2 } };

function Harness({ tier = {}, focus = null, onSave = vi.fn(async () => undefined), probe, onSelect = vi.fn() }: { tier?: any; focus?: any; onSave?: any; probe?: (tiers: any[], active: string) => void; onSelect?: any }) {
  const [tiers, setTiers] = useState<any[]>([{ id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq(), ...tier }]);
  const [active, setActive] = useState('t1');
  const [ctx, setCtx] = useState<any>({ name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10 });
  const calculated = useMemo(() => tiers.map(t => ({ ...t, summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: t.boq.length, designFee: 0, totalRevenue: 0, blendedGm: 0 } })), [tiers]);
  probe?.(tiers, active);
  return (
    <StudioDashboard
      projectContext={ctx}
      setProjectContext={setCtx}
      tiers={calculated}
      setTiers={setTiers as any}
      activeTierId={active}
      onSelectTier={(id: string) => { onSelect(id); setActive(id); }}
      bank={bank}
      aiStrategy={'balanced' as any}
      onViewInBank={() => undefined}
      onSaveProject={onSave}
      projectId=""
      focusLines={focus}
    />
  );
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

const PG = { boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING };
const lens = (name: 'Plan' | 'Rooms' | 'Sheet' | 'Tune' | 'Deal') => fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${name}$`) }));
const lineIds = (tiers: any[]) => tiers[0].boq.map((l: any) => l.id);
const at = (x: number, y: number) => ({ clientX: 40 + x * 20, clientY: 60 + y * 20 });
const stage = () => screen.getByRole('application', { name: /The flat/ }).parentElement as HTMLElement;
const piece = (id: string) => document.querySelector(`[data-piece="${id}"]`) as Element;
const inspector = () => screen.getByRole('complementary', { name: 'Line' });
const drag = async (el: Element, from: [number, number], to: [number, number], opts: any = {}) => {
  fireEvent.pointerDown(el, { ...at(...from), pointerId: 1, ...opts });
  fireEvent.pointerMove(stage(), { ...at(...to), pointerId: 1, ...opts });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  fireEvent.pointerUp(stage(), { ...at(...to), pointerId: 1, ...opts });
};

beforeEach(() => { org.playground = true; org.role = 'Super Admin'; setFiguresHidden(false); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); });

describe('one screen, five lenses', () => {
  it('shows Plan, Rooms, Sheet, Tune and Deal, opens on the Plan, and no mode buttons', () => {
    render(<Harness />);
    for (const n of ['Plan', 'Rooms', 'Sheet', 'Tune', 'Deal']) expect(screen.getByRole('radio', { name: new RegExp(`^${n}$`) })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Plan$/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Focus Editor' })).toBeNull();
    expect(screen.getByText('The four modes are now one tab')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Studio design library' })).toBeTruthy();
  });

  it('with the switch off, the four modes are back', () => {
    org.playground = false;
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Excel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cards' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Focus Editor/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Plan Takeoff/ })).toBeTruthy();
    expect(screen.queryByText('BOQ Playground')).toBeNull();
  });

  it('opened at a line (the slide-over), it opens on the Sheet with the line in the inspector', () => {
    render(<Harness focus={{ ids: ['l2'], at: 1 }} />);
    expect(screen.getByRole('radio', { name: /^Sheet$/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(inspector()).getByText('Wall paint')).toBeTruthy();
  });

  it('the hint’s tiles open the lens that replaced each mode', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Cards').closest('button')!);
    expect(screen.getByRole('radio', { name: /^Rooms$/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('The four modes are now one tab')).toBeNull();
  });
});

describe('Sheet: the Excel actions', () => {
  it('picks a line, deletes it, and Undo puts it back', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pick Wall paint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(lineIds(latest)).toEqual(['l1', 'l3']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);
  });

  it('a markup typed into its cell is the line’s markup', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    const cell = screen.getByRole('button', { name: /^Wall paint markup:/ });
    fireEvent.pointerDown(cell, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(cell, { clientX: 10, pointerId: 1 });
    const input = screen.getByRole('textbox', { name: 'Wall paint markup' });
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(latest[0].boq[1].marginOverride).toBe(30);
  });

  it('the full grid is one click away, with Set Linkage', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getByRole('button', { name: 'Open the full grid' }));
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Set Linkage' }));
    fireEvent.click(screen.getByRole('button', { name: 'DRAWING' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. DWG-ELEC-04'), { target: { value: 'DWG-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Linkage' }));
    expect(latest[0].boq.filter((l: any) => l.linkage?.refId === 'DWG-07').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Sheet' }));
    expect(screen.getByRole('button', { name: 'Open the full grid' })).toBeTruthy();
  });
});

describe('Click any line: the inspector (was the Focus Editor)', () => {
  it('a typed size sets the quantity of a line not on the plan', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    const size = within(inspector()).getByRole('textbox', { name: 'Size' });
    fireEvent.change(size, { target: { value: '7 x 8' } });
    fireEvent.blur(size);
    expect(latest[0].boq[0]).toMatchObject({ qty: 56, calcLength: 7, calcWidth: 8 });
  });

  it('steps to the next line, duplicates and deletes', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Next line' }));
    expect(within(inspector()).getByText('Wall paint')).toBeTruthy();
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Duplicate' }));
    expect(latest[0].boq.length).toBe(4);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Delete' }));
    expect(latest[0].boq.length).toBe(3);
  });
});

describe('Rooms (was Cards)', () => {
  it('a card per room, with its share of the work, rounded line by line', () => {
    render(<Harness tier={PG} />);
    lens('Rooms');
    // Each line rounded up to ₹100, then added: 67,200 + 11,300.
    expect(ceilTo((1000 + 400) * 1.2 * 40) + ceilTo((20 + 10) * 1.25 * 300)).toBe(78500);
    const card = document.querySelector('[data-roomcard="Bedroom"]') as HTMLElement;
    expect(within(card).getByText('₹78,500')).toBeTruthy();
    expect(within(card).getByText('Sliding wardrobe')).toBeTruthy();
  });

  it('dropping a library item on a card adds it to that room, on the plan', () => {
    let latest: any[] = [];
    render(<Harness tier={PG} probe={t => { latest = t; }} />);
    lens('Rooms');
    const card = document.querySelector('[data-roomcard="Kitchen"]') as HTMLElement;
    fireEvent.drop(card, { dataTransfer: { getData: () => 'bed' } });
    const added = latest[0].boq[3];
    expect(added).toMatchObject({ bankId: 'bed', roomId: 'Kitchen' });
    expect(added.place).toBeTruthy();
  });
});

describe('Plan (was Plan Takeoff)', () => {
  it('the flat with a price tag on every room and the client’s figure', () => {
    render(<Harness tier={PG} />);
    expect(screen.getByText('BEDROOM')).toBeTruthy();
    expect(screen.getByText('KITCHEN')).toBeTruthy();
    expect(screen.getByText('Client pays · work')).toBeTruthy();
  });

  it('dropping an item on a room writes a placed, priced line there', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.drop(stage(), { ...at(11.5, 6), dataTransfer: { getData: () => 'wardrobe' } });
    expect(latest[0].boq.length).toBe(1);
    // Dropped near the Bedroom's right wall (x 12): backed onto it.
    expect(latest[0].boq[0]).toMatchObject({ bankId: 'wardrobe', roomId: 'Bedroom', place: { rot: 90 } });
  });

  it('the library’s + adds an item along a free wall of the picked room', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Sliding wardrobe to Bedroom' }));
    expect(latest[0].boq[0]).toMatchObject({ roomId: 'Bedroom', place: { rot: 0 } });
    expect(screen.getByRole('status').textContent).toContain('added to Bedroom');
  });

  it('a drag moves a piece, redrawing only that piece; undo puts it back', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    const before = stageStats.pieceRenders;
    await drag(piece('p1'), [3.12, 1.12], [6, 5], { altKey: true });
    expect(latest[0].boq[0].place.x).toBeCloseTo(6, 1);
    expect(latest[0].boq[0].place.y).toBeCloseTo(5, 1);
    expect(stageStats.pieceRenders - before).toBeLessThanOrEqual(4);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0].boq[0].place.x).toBe(3.12);
  });

  it('a drag into another room moves the line to it', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    await drag(piece('p1'), [3.12, 1.12], [17, 1.5]);
    expect(latest[0].boq[0].roomId).toBe('Kitchen');
  });

  it('pulling the right handle widens it and the quantity follows', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    fireEvent.pointerDown(piece('p1'), { ...at(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(3.12, 1.12), pointerId: 1 });
    await drag(screen.getByLabelText('Resize from the right'), [6.12, 1.12], [8.12, 1.12]);
    expect(latest[0].boq[0]).toMatchObject({ calcLength: 8, calcWidth: 7, qty: 56 });
  });

  it('R turns the picked piece; the inspector shows it as the selected line', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    fireEvent.pointerDown(piece('p1'), { ...at(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(3.12, 1.12), pointerId: 1 });
    expect(within(inspector()).getByText('Sliding wardrobe')).toBeTruthy();
    fireEvent.keyDown(stage(), { key: 'r' });
    expect(latest[0].boq[0].place.rot).toBe(90);
  });

  it('clicking a room opens the room: what it measures, and its items', () => {
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} />);
    const room = document.querySelector('[data-room="Bedroom"]')!;
    fireEvent.pointerDown(room, { ...at(8, 8), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(8, 8), pointerId: 1 });
    const ins = screen.getByRole('complementary', { name: 'Room' });
    expect(within(ins).getByText('Walls to paint')).toBeTruthy();
    expect(within(ins).getByText('Sliding wardrobe')).toBeTruthy();
  });
});

describe('The bar', () => {
  it('Save changes saves through the app', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<Harness onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save changes/ })); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Tune and Deal say what is coming', () => {
    render(<Harness />);
    lens('Tune');
    expect(screen.getByText('Tune comes next')).toBeTruthy();
    lens('Deal');
    expect(screen.getByText('Deal comes next')).toBeTruthy();
  });
});

describe('Classic and Playground versions', () => {
  it('an older option opens as a Classic BOQ, at exact amounts', () => {
    render(<Harness />);
    expect(screen.getByText('A Classic BOQ, priced as it always was')).toBeTruthy();
    expect(screen.getAllByText(/Classic BOQ · Draft/).length).toBeGreaterThan(0);
  });

  it('Make a Playground version copies it into the next version and opens it; the Classic one stays', () => {
    let latest: any[] = []; let active = '';
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} probe={(t, a) => { latest = t; active = a; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make a Playground version' }));
    expect(latest.length).toBe(2);
    const [v1, v2] = latest;
    expect(v1.boqFormat).toBeUndefined();
    expect(v2).toMatchObject({ parentTierId: 't1', boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING, name: 'Comfort Upgrade' });
    expect(v2.boq.map((l: any) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(onSelect).toHaveBeenCalledWith(v2.id);
    expect(active).toBe(v2.id);
    expect(screen.getAllByText(/Playground BOQ · Draft/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Make a Playground version' })).toBeNull();
  });
});

describe('Who sees what', () => {
  const openLine = () => { lens('Sheet'); fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]); };

  it('the studio’s finance roles see cost, markup and margin', () => {
    render(<Harness />);
    openLine();
    expect(within(inspector()).getByText('Studio only')).toBeTruthy();
    expect(screen.getAllByText('Markup ↔').length).toBeGreaterThan(0);
  });

  it('Hide figures hides cost and margin; prices stay', () => {
    setFiguresHidden(true);
    render(<Harness />);
    openLine();
    expect(within(inspector()).queryByText('Studio only')).toBeNull();
    expect(screen.queryByText('Markup ↔')).toBeNull();
    expect(within(inspector()).getByText('Amount')).toBeTruthy();
  });

  it('a Designer never sees them', () => {
    org.role = 'Designer';
    render(<Harness />);
    openLine();
    expect(within(inspector()).queryByText('Studio only')).toBeNull();
  });
});

describe('Across the flat', () => {
  it('adds painting as walls and ceilings measured from the plan, from the room', () => {
    let latest: any[] = [];
    render(<Harness tier={PG} probe={t => { latest = t; }} />);
    lens('Rooms');
    fireEvent.click(screen.getByRole('button', { name: 'Open Bedroom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add painting from the plan' }));
    const added = latest[0].boq.slice(3);
    expect(added.map((l: any) => [l.bankId, l.byRoom.basis, l.roomId])).toEqual([['paint', 'wallPaint', 'Whole flat'], ['paint', 'ceilingPaint', 'Whole flat']]);
    expect(added[0].qty).toBeGreaterThan(0);
  });

  it('splits a whole-flat line by room, takes a room out, and puts it back to one figure', () => {
    let latest: any[] = [];
    const flat = [...baseBoq(), { id: 'l4', bankId: 'paint', qty: 900, roomId: 'Whole flat' }];
    render(<Harness tier={{ boq: flat }} probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Wall paint')[1]);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Split by room' }));
    const shared = latest[0].boq.find((l: any) => l.id === 'l4');
    expect(shared.byRoom.basis).toBe('wallPaint');
    const both = shared.qty;
    fireEvent.click(within(inspector()).getByRole('checkbox', { name: 'Kitchen takes a share' }));
    const fewer = latest[0].boq.find((l: any) => l.id === 'l4');
    expect(fewer.byRoom.rooms.Kitchen).toEqual({ on: false });
    expect(fewer.qty).toBeLessThan(both);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'One figure for the flat' }));
    expect(latest[0].boq.find((l: any) => l.id === 'l4').byRoom).toBeUndefined();
  });
});
