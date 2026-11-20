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
const specStore: { bank: any } = { bank: null };
vi.mock('../../services/materialSpecsService', () => ({
  watchMaterialSpecs: (_t: string, onBank: (b: any) => void) => { onBank(specStore.bank); return () => {}; },
  saveMaterialSpecs: vi.fn(async () => undefined),
}));

import StudioDashboard from '../../components/StudioDashboard';
import { stageStats } from '../../components/playground/PlanStage';
import { setFiguresHidden } from '../../lib/figuresPrivacy';
import { PLAYGROUND_PRICING, ceilTo } from '../../lib/playground/pricing';
import { studioStandard, saveNewVersion } from '../../lib/materialSpecs';
import { withRecipeSpecs } from '../../lib/lineSpecs';

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

function Harness({ tier = {}, focus = null, onSave = vi.fn(async () => undefined), probe, onSelect = vi.fn(), ctx0, probeCtx, bankIn }: { tier?: any; focus?: any; onSave?: any; probe?: (tiers: any[], active: string) => void; onSelect?: any; ctx0?: any; probeCtx?: (ctx: any) => void; bankIn?: any[] }) {
  const [tiers, setTiers] = useState<any[]>([{ id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq(), ...tier }]);
  const [active, setActive] = useState('t1');
  const [ctx, setCtx] = useState<any>(ctx0 || { name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10 });
  probeCtx?.(ctx);
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
      bank={bankIn || bank}
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

beforeEach(() => { org.playground = true; org.role = 'Super Admin'; specStore.bank = null; setFiguresHidden(false); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); });

describe('one screen, five lenses', () => {
  it('shows Plan, Rooms, Sheet, Tune and Deal, opens a Playground version on the Plan, and no mode buttons', () => {
    render(<Harness tier={PG} />);
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

  it('Deal says what is coming', () => {
    render(<Harness />);
    lens('Deal');
    expect(screen.getByText('Deal comes next')).toBeTruthy();
  });
});

describe('Classic and Playground versions', () => {
  it('an older option opens as it is: a Classic BOQ, on the Sheet, at exact amounts, with no library', () => {
    render(<Harness />);
    expect(screen.getByText(/Classic BOQ · made before the Playground · Comfort Upgrade is a draft/)).toBeTruthy();
    expect(screen.getByText(/Nothing is recalculated: amounts keep their exact figures/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Sheet$/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('complementary', { name: 'Studio design library' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add items/ })).toBeNull();
    // Exact: 1,400 × 1.2 × 40 = 67,200 and 30 × 1.25 × 300 = 11,250, not rounded up.
    expect(screen.getAllByText('₹11,250').length).toBeGreaterThan(0);
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
    fireEvent.click(within(inspector()).getByRole('button', { name: /^Use the room figures/ }));
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

describe('Material specs on the lines (S2)', () => {
  const std = studioStandard();
  const recipeLine = (o: any = {}) => withRecipeSpecs({ id: 'r1', bankId: 'wardrobe', qty: 40, roomId: 'Bedroom', baseRate: 1000, ...o } as any, bank[0], std, 'C');

  it('a new line on a Playground version takes its recipe’s materials at the option’s grade, and their words', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Sliding wardrobe to Bedroom' }));
    const l = latest[0].boq[0];
    expect(l.materialSpecs.Carcass).toEqual({ id: 'ply-bwr', v: 1 });
    expect(l.specs).toMatch(/^18 mm BWR-grade plywood carcass/);
  });

  it('a Classic BOQ’s new lines keep the Item Bank’s words', () => {
    let latest: any[] = [];
    render(<Harness tier={{ boq: [] }} probe={t => { latest = t; }} />);
    lens('Rooms');
    fireEvent.drop(document.querySelector('[data-roomcard="Bedroom"]') as HTMLElement, { dataTransfer: { getData: () => 'wardrobe' } });
    expect(latest[0].boq[0].materialSpecs).toBeUndefined();
    expect(latest[0].boq[0].specs).toBeUndefined();
  });

  it('the inspector shows the parts; a part and a finish change the words and the price', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [recipeLine()] }} probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    const ins = inspector();
    expect(within(ins).getByText('Material specs')).toBeTruthy();
    fireEvent.change(within(ins).getByRole('combobox', { name: 'Hardware' }), { target: { value: 'hw-hettich' } });
    expect(latest[0].boq[0].specs).toContain('tandem drawer runners (Hettich)');
    fireEvent.click(within(inspector()).getByRole('button', { name: /Veneer/ }));
    expect(latest[0].boq[0]).toMatchObject({ baseRate: 1300, finishBase: 1000, materialSpecs: { 'Outer finish': { id: 'ven-walnut', v: 2 } } });
  });

  it('a finish priced as a range is shown in a shade: the words name it, the price stays (PR M)', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [recipeLine()] }} probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    const ins = inspector();
    expect(within(ins).getByText('chosen at Selections')).toBeTruthy();
    expect(within(ins).getByText('250+ · one price')).toBeTruthy();
    expect(within(ins).getByText('+242 at the studio')).toBeTruthy();
    const before = latest.length ? latest[0].boq[0] : recipeLine();
    fireEvent.click(within(ins).getByRole('button', { name: 'Show it in Smoked oak' }));
    const l = latest[0].boq[0];
    expect(l.materialSpecs['Outer finish']).toEqual({ id: 'lam-oak', v: 2, shade: 'Smoked oak' });
    expect(l.baseRate).toBe(before.baseRate);
    expect(l.specs).toContain('outside, Smoked oak or any of 250+ shades (Merino');
    expect(screen.getByText(/Same price, any shade in the range costs the same/)).toBeTruthy();
    expect(within(inspector()).getByRole('button', { name: 'Show it in Smoked oak' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('own words stop following the recipe until Back to the recipe', () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [recipeLine()] }} probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Write my own' }));
    expect(latest[0].boq[0].specsOwn).toBe(true);
    const box = within(inspector()).getByRole('textbox', { name: 'Own words' });
    fireEvent.change(box, { target: { value: 'As agreed on site.' } });
    fireEvent.blur(box);
    expect(latest[0].boq[0].specs).toBe('As agreed on site.');
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Back to the recipe' }));
    expect(latest[0].boq[0].specsOwn).toBeUndefined();
    expect(latest[0].boq[0].specs).toMatch(/^18 mm BWR/);
  });

  it('a newer version is offered to a draft: the Live BOQ updates the lines on request', () => {
    specStore.bank = saveNewVersion(std, 'hw-ss', { words: 'soft-close hinges and Hafele channels', brand: 'Hafele equivalent', note: 'Hafele named' }, 'Owner', 5);
    let latest: any[] = [];
    const before = recipeLine();
    render(<Harness tier={{ ...PG, boq: [before] }} probe={t => { latest = t; }} />);
    expect(screen.getByText('Newer material specs are out')).toBeTruthy();
    expect(latest[0].boq[0].specs).toBe(before.specs);
    fireEvent.click(screen.getByRole('button', { name: 'Update 1 line' }));
    expect(latest[0].boq[0].materialSpecs.Hardware).toEqual({ id: 'hw-ss', v: 2 });
    expect(latest[0].boq[0].specs).toContain('Hafele channels (Hafele equivalent)');
  });

  it('an option already sent to the client is never offered it', () => {
    specStore.bank = saveNewVersion(std, 'hw-ss', { words: 'soft-close hinges and Hafele channels', note: 'Hafele named' }, 'Owner', 5);
    function Sent() {
      const [tiers, setTiers] = useState<any[]>([{ id: 't1', name: 'Comfort Upgrade', boq: [recipeLine()], ...PG }]);
      return <StudioDashboard projectContext={{ name: 'Test', rooms, documents: { issues: [{ kind: 'proposal', snapshot: { tierId: 't1' } }] } } as any} setProjectContext={() => {}}
        tiers={tiers.map(t => ({ ...t, summary: {} }))} setTiers={setTiers as any} activeTierId="t1" bank={bank} aiStrategy={'balanced' as any}
        onViewInBank={() => undefined} onSaveProject={async () => undefined} projectId="" />;
    }
    render(<Sent />);
    expect(screen.queryByText('Newer material specs are out')).toBeNull();
    expect(screen.queryByText('new spec')).toBeNull();
  });
});

describe('Tune (PR 4)', () => {
  it('a fader per room and one for every room; a drag writes the room’s markups, and is one undo', async () => {
    let latest: any[] = [];
    render(<Harness tier={PG} probe={t => { latest = t; }} />);
    lens('Tune');
    expect(screen.getByRole('button', { name: /^Markup for Bedroom:/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Markup for Every room:/ })).toBeTruthy();
    const knob = screen.getByRole('button', { name: /^Markup for Kitchen:/ });
    fireEvent.pointerDown(knob, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 266, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientY: 232, pointerId: 1 });
    fireEvent.pointerUp(knob, { clientY: 232, pointerId: 1 });
    // 68 px of a 170 px track is 20 points of markup: the counter's 10% becomes 30%.
    expect(latest[0].boq.find((l: any) => l.id === 'l3').marginOverride).toBeCloseTo(30, 0);
    expect(latest[0].boq.find((l: any) => l.id === 'l1').marginOverride).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(latest[0].boq.find((l: any) => l.id === 'l3').marginOverride).toBeUndefined();
  });

  it('the client’s number moves the markups to meet it, never under the floor, and says the gap', () => {
    let latest: any[] = [];
    render(<Harness tier={PG} probe={t => { latest = t; }} />);
    lens('Tune');
    const input = screen.getByLabelText("The client's number");
    fireEvent.change(input, { target: { value: '70000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Work is ₹1,00,500; at every floor it is still above ₹70,000.
    expect(screen.getByText(/The floors stop at/)).toBeTruthy();
    latest[0].boq.forEach((l: any) => { if (l.marginOverride != null) expect(l.marginOverride).toBeGreaterThanOrEqual(17.64); });
  });

  it('a Designer does not see it', () => {
    org.role = 'Designer';
    render(<Harness tier={PG} />);
    lens('Tune');
    expect(screen.getByText('Studio figures are hidden')).toBeTruthy();
  });
});

describe('no plan yet (PR 5)', () => {
  const noPlan = { name: 'Joshi – 2BHK', area: 650, config: '2BHK', rooms: [], designFeeType: 'percentage', designFee: 10 };

  it('a rough sketch becomes the project’s plan in one step', async () => {
    let c: any = null;
    render(<Harness ctx0={noPlan} tier={{ ...PG, boq: [] }} probeCtx={x => { c = x; }} />);
    expect(screen.getByText('No plan yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sketch a rough plan' }));
    const dlg = screen.getByRole('dialog', { name: 'Sketch a rough plan' });
    expect(within(dlg).getByText('No plan yet · Joshi – 2BHK')).toBeTruthy();
    const svg = within(dlg).getByRole('application', { name: 'Sketch area' });
    // 42 × 32 ft drawn 420 × 320 px: 10 px a foot, the grid's 0, 0 at 10, 10.
    (svg as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 420, height: 320, right: 420, bottom: 320, x: 0, y: 0 });
    const px = (x: number, y: number) => ({ clientX: (x + 1) * 10, clientY: (y + 1) * 10, pointerId: 1 });
    const box = (x: number, y: number, w: number, h: number, kind: string) => {
      fireEvent.pointerDown(svg, px(x, y));
      fireEvent.pointerMove(svg, px(x + w, y + h));
      fireEvent.pointerUp(svg, px(x + w, y + h));
      fireEvent.click(within(dlg).getByRole('button', { name: kind }));
    };
    box(0.3, 0.2, 13.4, 13.6, 'Living');
    box(14.1, 0.6, 8.6, 7.7, 'Kitchen');
    box(0, 14.5, 12.6, 12.4, 'Bedroom');
    box(13, 14.2, 9, 12.4, 'Bedroom');
    expect(within(dlg).getByText('4 rooms. Rough is fine: gaps, overlaps and crooked sizes are tidied for you.')).toBeTruthy();
    expect(within(dlg).getByText('Bedroom 2')).toBeTruthy();
    expect((within(dlg).getByRole('button', { name: 'Use as the plan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Tidy into a plan' }));
    expect(within(dlg).getByText(/so the rooms add up to 650 sq ft/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Use as the plan' }));
    expect(screen.queryByRole('dialog', { name: 'Sketch a rough plan' })).toBeNull();
    expect(c.planSheet).toEqual({ source: 'sketch' });
    const placed = c.rooms.filter((r: any) => r.plan);
    expect(placed.map((r: any) => r.name)).toEqual(['Living', 'Kitchen', 'Bedroom', 'Bedroom 2']);
    expect(Math.abs(placed.reduce((a: number, r: any) => a + r.plan.w * r.plan.h, 0) - 650) / 650).toBeLessThan(0.01);
    expect(screen.getByText(/Saved as the project’s plan \(source: sketch\)/)).toBeTruthy();
    expect(document.querySelector('[data-room="Kitchen"]')).toBeTruthy();
  });

  it('a quick build makes the rooms, their plan and each room’s standard pieces in one step', () => {
    let c: any = null, latest: any[] = [];
    render(<Harness ctx0={noPlan} tier={{ ...PG, boq: [] }} probeCtx={x => { c = x; }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick build' }));
    const dlg = screen.getByRole('dialog', { name: 'Quick build' });
    fireEvent.click(within(dlg).getByRole('radio', { name: '3-BHK' }));
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Premium' }));
    expect(within(dlg).getByText(/8 rooms, a standard 3-BHK/)).toBeTruthy();
    expect(within(dlg).getByText(/Not in your Item Bank, so left out:/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Build the BOQ' }));
    expect(c.planSheet).toEqual({ source: 'blocks' });
    const placed = c.rooms.filter((r: any) => r.plan);
    expect(placed).toHaveLength(8);
    expect(Math.abs(placed.reduce((a: number, r: any) => a + r.plan.w * r.plan.h, 0) - 650) / 650).toBeLessThan(0.01);
    const boq = latest[0].boq;
    // Three bedrooms: a wardrobe and a bed each, every one on the plan or waiting under Needs a place.
    expect(boq.filter((l: any) => l.bankId === 'wardrobe').map((l: any) => l.roomId).sort()).toEqual(['Guest Bedroom', 'Kids Bedroom', 'Master Bedroom']);
    expect(boq.filter((l: any) => l.bankId === 'bed')).toHaveLength(3);
    // Painting, shared into the rooms from the plan.
    expect(boq.some((l: any) => l.bankId === 'paint' && l.byRoom?.basis === 'wallPaint')).toBe(true);
    expect(latest[0].specGrade).toBe('P');
    expect(screen.getByText(/^Built: 8 rooms, \d+ pieces placed/)).toBeTruthy();
  });

  it('a room is sized by the handle on its wall; the room across a shared wall gives the same', async () => {
    let c: any = null;
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probeCtx={x => { c = x; }} />);
    const bedroom = document.querySelector('[data-room="Bedroom"]') as Element;
    fireEvent.pointerDown(bedroom, { ...at(6, 8), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(6, 8), pointerId: 1 });
    const handle = document.querySelector('[data-room-edge="right"]') as Element;
    expect(handle.getAttribute('aria-label')).toBe('Move the right wall of Bedroom');
    await drag(handle, [12, 5], [13, 5]);
    expect(c.rooms.find((r: any) => r.name === 'Bedroom').plan).toEqual({ x: 0, y: 0, w: 13, h: 10 });
    expect(c.rooms.find((r: any) => r.name === 'Bedroom').size).toBe(130);
    expect(c.rooms.find((r: any) => r.name === 'Kitchen').plan).toEqual({ x: 13, y: 0, w: 9, h: 8 });
    expect(screen.getByText('Bedroom is now 13′ × 10′, 130 sq ft. Kitchen gave the same.')).toBeTruthy();
  });
});

describe('Excel out and in (PR 6)', () => {
  /* jsdom's File may not read itself back: read it through FileReader. */
  if (!(File.prototype as any).arrayBuffer) {
    (File.prototype as any).arrayBuffer = function () {
      return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsArrayBuffer(this); });
    };
  }
  const xlsxOf = async (sheets: Record<string, any[][]>) => {
    const XLSX: any = await import('xlsx');
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([n, g]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(g), n));
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  };
  const upload = async (bytes: Uint8Array, name: string) => {
    const input = screen.getByLabelText('Excel file') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([bytes], name)] } });
      await new Promise(r => setTimeout(r, 400));
    });
  };

  it('the Export menu offers the studio copy, the client copy and the PDF', () => {
    render(<Harness tier={PG} />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByText('Studio copy · .xlsx')).toBeTruthy();
    expect(screen.getByText('Client copy · .xlsx')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
  });

  it('a studio copy comes back by its Line IDs: every change shown and priced, applied in one undo', async () => {
    const { buildStudioBook, readBook } = await import('../../lib/playground/excelBook');
    let latest: any[] = [];
    render(<Harness tier={PG} probe={t => { latest = t; }} />);
    const bankMap = new Map(bank.map(b => [b.id, b]));
    const book = await readBook(await buildStudioBook(latest[0].boq, { bankMap, rules: PLAYGROUND_PRICING, rooms: rooms as any }, { studio: 'S', project: 'Test flat', option: 'Comfort Upgrade', tierId: 't1', roundTo100: true }));
    const g = book.BOQ as any[][];
    const h = g.findIndex(r => r[0] === 'Line ID');
    g[g.findIndex(r => r[0] === 'L-0003')][g[h].indexOf('Qty')] = 12; // the kitchen counter, 10 → 12 rft
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    const dlg = () => screen.getByRole('dialog', { name: 'What are you bringing in?' });
    expect(within(dlg()).getByText('A studio copy, edited in Excel')).toBeTruthy();
    await upload(await xlsxOf(book as any), 'Test flat – studio copy.xlsx');
    const d = screen.getByRole('dialog', { name: 'Test flat – studio copy.xlsx' });
    expect(within(d).getByText(/A studio copy, read by its Line IDs\. 2 rows are unchanged and left alone\./)).toBeTruthy();
    expect(within(d).getByText('Qty 10 → 12')).toBeTruthy();
    expect(within(d).getByText(/the BOQ has not changed since/)).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Apply changes' }));
    expect(latest[0].boq.find((l: any) => l.id === 'l3').qty).toBe(12);
    expect(screen.getByText(/1 change from Test flat – studio copy\.xlsx applied/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(latest[0].boq.find((l: any) => l.id === 'l3').qty).toBe(10);
  });

  it('any other sheet: each row placed in its room and priced to the sheet; nothing written until Add', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    await upload(await xlsxOf({ Sheet1: [
      ['Item', 'Location', 'Qty', 'Unit', 'Rate'],
      ['Sliding wardrobe 6 x 7 ft', 'Bedroom', null, 'sq ft', 2100],
      ['Curtain tracks, motorised', null, 4, 'nos', 9500],
    ] }), 'Vendor quote.xlsx');
    const d = screen.getByRole('dialog', { name: 'Vendor quote.xlsx' });
    expect(within(d).getByText(/Columns matched as today:/)).toBeTruthy();
    expect(within(d).getByText('On the plan')).toBeTruthy();
    expect(within(d).getByText('Not in the Item Bank')).toBeTruthy();
    expect(within(d).getByText('Needs a room')).toBeTruthy();
    // The bank's ₹1,400 cost, marked up 50% to meet the sheet's ₹2,100.
    expect(within(d).getByText(/markup/).textContent).toContain('50.0%');
    expect(latest[0].boq).toEqual([]);
    fireEvent.click(within(d).getByRole('button', { name: 'Add 2 lines' }));
    const boq = latest[0].boq;
    expect(boq).toHaveLength(2);
    expect(boq[0]).toMatchObject({ bankId: 'wardrobe', roomId: 'Bedroom', qty: 42, marginOverride: 50 });
    expect(boq[0].place).toBeTruthy();
    expect(boq[1]).toMatchObject({ name: 'Curtain tracks, motorised', cat: 'Imported', qty: 4, roomId: 'Bedroom' });
  });

  it('an item already in the room is not added on its own: the user is asked; what is added is drawn on the plan', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    await upload(await xlsxOf({ Sheet1: [
      ['Item', 'Location', 'Qty', 'Unit', 'Rate'],
      ['Sliding wardrobe 6 x 7 ft', 'Bedroom', null, 'sq ft', 2100],
      ['Queen bed', 'Bedroom', 1, 'nos', 48000],
    ] }), 'List.xlsx');
    const d = screen.getByRole('dialog', { name: 'List.xlsx' });
    expect(within(d).getByText('Already in the BOQ')).toBeTruthy();
    expect(within(d).getByText(/Bedroom has it as L-0001\. Left out unless you add another\./)).toBeTruthy();
    expect(within(d).getByText('1 already in the BOQ, left out')).toBeTruthy();
    const add = within(d).getByRole('checkbox', { name: 'Add another Sliding wardrobe' }) as HTMLInputElement;
    expect(add.checked).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: 'Add 1 line' }));
    expect(latest[0].boq.map((l: any) => l.bankId)).toEqual(['wardrobe', 'bed']);
    // The bed is drawn in the bedroom, as a piece from the library would be.
    expect(latest[0].boq[1].place).toBeTruthy();
    expect(document.querySelector(`[data-piece="${latest[0].boq[1].id}"]`)).toBeTruthy();
    expect(screen.getByText(/1 line added from List\.xlsx: 1 drawn on the plan; 1 already in the BOQ left out/)).toBeTruthy();
  });

  it('ticking Add another adds the repeat too', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    await upload(await xlsxOf({ Sheet1: [['Item', 'Location', 'Qty', 'Unit', 'Rate'], ['Sliding wardrobe 6 x 7 ft', 'Bedroom', null, 'sq ft', 2100]] }), 'One.xlsx');
    const d = screen.getByRole('dialog', { name: 'One.xlsx' });
    expect((within(d).getByRole('button', { name: 'Add 0 lines' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(d).getByRole('checkbox', { name: 'Add another Sliding wardrobe' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Add 1 line' }));
    expect(latest[0].boq.filter((l: any) => l.bankId === 'wardrobe')).toHaveLength(2);
  });
});

describe('the Civil layer (PR C)', () => {
  const civilBank = [
    ...bank,
    { id: 'b50', name: 'Wall demolition, brick', cat: 'Civil', unit: 'sq ft', specs: 'Breaking brick wall with plaster.', materials: 22, labor: 14, margin: 25 },
    { id: 'b52', name: 'Remove existing floor tiles', cat: 'Civil', unit: 'sq ft', specs: 'Hacking the old tiles.', materials: 10, labor: 8, margin: 25 },
    { id: 'b53', name: 'Floor tiles, laid', cat: 'Flooring', unit: 'sq ft', specs: 'Vitrified tiles.', materials: 90, labor: 42, margin: 25 },
    { id: 'b54', name: 'Wall tiles to 7 ft, laid', cat: 'Tiling', unit: 'sq ft', specs: 'Wall tiles to 7 ft.', materials: 80, labor: 40, margin: 25 },
    { id: 'b55', name: 'Waterproofing, floor and upstand', cat: 'Civil', unit: 'sq ft', specs: 'Two coats.', materials: 30, labor: 22, margin: 25 },
    { id: 'b56', name: 'Debris removal', cat: 'Civil', unit: 'lot', specs: 'Carting away.', materials: 9000, labor: 5400, margin: 25 },
  ];
  const renovation = { name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10, propertyStatus: 'finished', civilScope: { flooring: true } };
  const civilOn = () => fireEvent.click(screen.getByRole('radio', { name: /^Civil/ }));
  const panel = () => screen.getByRole('region', { name: 'Civil work' });
  const room = (name: string) => document.querySelector(`[data-room="${name}"]`) as Element;

  it('the Civil layer fades the furniture back and offers the tools; Start from the brief lays out the flooring, each line measured', () => {
    let latest: any[] = [];
    render(<Harness ctx0={renovation} bankIn={civilBank} tier={{ ...PG, boq: [placedWardrobe] }} probe={t => { latest = t; }} />);
    civilOn();
    expect(screen.getByText('Civil layer: the furniture fades back. Pick a tool and draw, or start from the brief.')).toBeTruthy();
    expect(within(panel()).getByText('Renovation')).toBeTruthy();
    expect(within(panel()).getByText(/The brief asks for new flooring throughout\. Quantities come from the plan\./)).toBeTruthy();
    ['Break a wall', 'Build a wall', 'Re-floor a room', 'Wall tiles to 7′', 'Waterproofing'].forEach(t => expect(within(panel()).getByRole('button', { name: new RegExp(t) })).toBeTruthy());
    // No item for a new wall in this bank: the tool says so.
    expect(within(within(panel()).getByRole('button', { name: /Build a wall/ })).getByText('Not in the Item Bank yet')).toBeTruthy();
    expect(piece('p1').closest('g[opacity]')!.getAttribute('opacity')).toBe('0.22');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start from the brief' }));
    const civil = latest[0].boq.filter((l: any) => l.civil);
    expect(civil.map((l: any) => [l.roomId, l.civil.type, l.qty])).toEqual([
      ['Bedroom', 'floorRemove', 120], ['Bedroom', 'floor', 120], ['Kitchen', 'floorRemove', 80], ['Kitchen', 'floor', 80],
    ]);
    expect(latest[0].boq.filter((l: any) => l.bankId === 'b56')).toHaveLength(1);
    expect(screen.getByText(/^From the brief: 4 civil lines for new flooring throughout, measured from the plan\. Debris removal added once, across the flat\./)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Civil/ }).textContent).toBe('Civil 4');
    // One undo takes it all back.
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(latest[0].boq.filter((l: any) => l.civil)).toHaveLength(0);
  });

  it('Replace flooring is room by room: the rooms the brief names, each in two lines', () => {
    let latest: any[] = [];
    render(<Harness ctx0={{ ...renovation, clientBrief: 'Modular kitchen. Replace the flooring in the kitchen only.' }} bankIn={civilBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    civilOn();
    expect(within(panel()).getByText(/The brief asks for new flooring in the kitchen\. Quantities come from the plan\./)).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start from the brief' }));
    expect(latest[0].boq.filter((l: any) => l.civil).map((l: any) => [l.roomId, l.civil.type, l.bankId, l.qty])).toEqual([
      ['Kitchen', 'floorRemove', 'b52', 80], ['Kitchen', 'floor', 'b53', 80],
    ]);
    // Any other room is re-floored by hand with the tool, when the site needs it.
    fireEvent.click(within(panel()).getByRole('button', { name: /Re-floor a room/ }));
    fireEvent.pointerDown(room('Bedroom'), { ...at(6, 5), pointerId: 1 });
    expect(latest[0].boq.filter((l: any) => l.civil && l.roomId === 'Bedroom').map((l: any) => l.civil.type)).toEqual(['floorRemove', 'floor']);
  });

  it('a room tool clicked on a room puts its civil work in, and again takes it out; waterproofing is for wet rooms', () => {
    let latest: any[] = [];
    render(<Harness ctx0={renovation} bankIn={civilBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    civilOn();
    fireEvent.click(within(panel()).getByRole('button', { name: /Wall tiles to 7′/ }));
    expect(screen.getByText('Wall tiles to 7′: click a bathroom or the kitchen. Click the tool again, or press Esc, to stop.')).toBeTruthy();
    fireEvent.pointerDown(room('Kitchen'), { ...at(16, 4), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(16, 4), pointerId: 1 });
    // 36 ft of wall × 7 ft, less one door.
    expect(latest[0].boq.find((l: any) => l.civil?.type === 'walls7')).toMatchObject({ roomId: 'Kitchen', qty: 36 * 7 - 21 });
    fireEvent.pointerDown(room('Kitchen'), { ...at(16, 4), pointerId: 1 });
    expect(latest[0].boq.some((l: any) => l.civil?.type === 'walls7')).toBe(false);
    expect(screen.getByText('Kitchen: wall tiles to 7′ taken out.')).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: /Waterproofing/ }));
    fireEvent.pointerDown(room('Bedroom'), { ...at(6, 5), pointerId: 1 });
    expect(screen.getByText('Waterproofing is for bathrooms and the kitchen.')).toBeTruthy();
    // Esc stops the tool: a click on a room picks it again.
    fireEvent.keyDown(stage(), { key: 'Escape' });
    expect(within(panel()).getByRole('button', { name: /Waterproofing/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('a wall break snaps to the nearest wall, is measured from it, and says how', async () => {
    let latest: any[] = [];
    render(<Harness ctx0={renovation} bankIn={civilBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    civilOn();
    fireEvent.click(within(panel()).getByRole('button', { name: /Break a wall/ }));
    await drag(room('Bedroom'), [11.6, 2], [11.8, 7]);
    const brk = latest[0].boq.find((l: any) => l.civil?.type === 'break');
    expect(brk).toMatchObject({ roomId: 'Bedroom', qty: 50, civil: { segment: [12, 2, 12, 7] } });
    expect(brk.specs).toMatch(/Check structure and society approval before the wall is broken\.$/);
    const ins = inspector();
    expect(within(ins).getByText('Measured from the plan')).toBeTruthy();
    expect(within(ins).getByText(/5′ long × 10′ high:/)).toBeTruthy();
    fireEvent.change(within(ins).getByLabelText('Length'), { target: { value: '6' } });
    fireEvent.blur(within(ins).getByLabelText('Length'));
    expect(latest[0].boq.find((l: any) => l.civil?.type === 'break')).toMatchObject({ qty: 60, civil: { segment: [12, 2, 12, 8] } });
    expect(document.querySelector(`[data-civ="${brk.id}"]`)).toBeTruthy();
  });

  it('a room’s inspector toggles its civil work; resizing the room moves its civil quantities', async () => {
    let latest: any[] = [], c: any = null;
    render(<Harness ctx0={renovation} bankIn={civilBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} probeCtx={x => { c = x; }} />);
    civilOn();
    fireEvent.pointerDown(room('Bedroom'), { ...at(6, 5), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(6, 5), pointerId: 1 });
    const ri = screen.getByRole('complementary', { name: 'Room' });
    expect(within(ri).getByText('Civil work in this room')).toBeTruthy();
    expect(within(ri).queryByRole('button', { name: 'Waterproofing' })).toBeNull();
    fireEvent.click(within(ri).getByRole('button', { name: 'Re-floor a room' }));
    expect(latest[0].boq.filter((l: any) => l.civil).map((l: any) => l.qty)).toEqual([120, 120]);
    // Pull the bedroom's bottom wall down 2 ft: its floor follows.
    await drag(document.querySelector('[data-room-edge="bottom"]') as Element, [6, 10], [6, 12]);
    expect(c.rooms.find((r: any) => r.name === 'Bedroom').plan.h).toBe(12);
    expect(latest[0].boq.filter((l: any) => l.civil).map((l: any) => l.qty)).toEqual([144, 144]);
  });

  it('the Owner adds the standard civil items the Item Bank lacks; a tool with no item says what to add', () => {
    let c: any = null;
    render(<Harness ctx0={renovation} probeCtx={x => { c = x; }} tier={{ ...PG, boq: [] }} />);
    civilOn();
    fireEvent.click(within(panel()).getByRole('button', { name: /Re-floor a room/ }));
    fireEvent.pointerDown(room('Kitchen'), { ...at(16, 4), pointerId: 1 });
    expect(screen.getByText('No item in the Item Bank for the new floor: add one such as “Floor tiles, laid”, priced per sq ft.')).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add the standard civil items' }));
    expect(c.adHocItems.map((i: any) => i.name)).toEqual([
      'Wall demolition, brick', 'New wall, 4.5″ brick', 'Remove existing floor tiles', 'Floor tiles, laid', 'Wall tiles to 7 ft, laid', 'Waterproofing, floor and upstand', 'Debris removal',
    ]);
  });
});
