/*
  The BOQ Playground: the BOQ Editor for every studio, the approved mockup's one
  screen, with five lenses (Plan, Rooms, Sheet, Tune, Deal), the studio design
  library and the Live BOQ.

  Each test drives one thing the four old modes did, from its new home, the way
  a person would. The four modes and the studio's switch are gone (PR 7b).

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

const org = { playground: true as boolean | undefined, role: 'Super Admin' };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', playground: org.playground }, currentRole: org.role, currentRoles: [org.role], currentUserAuth: { displayName: 'Priya Shah', email: 'priya@example.com' } }),
}));
const studio: { settings: any; update: any } = { settings: {}, update: null };
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: studio.settings, updateSettings: studio.update || (async () => undefined) }) }));
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

const pdfMock = { save: vi.fn(), built: 0 };
vi.mock('../../lib/proposalPdf', async (orig) => ({
  ...(await orig() as any),
  buildProposalPdf: vi.fn(async () => { pdfMock.built++; return { save: pdfMock.save, output: () => new Blob(['%PDF']) }; }),
}));

import StudioDashboard from '../../components/StudioDashboard';
import { JourneyContext } from '../../services/journeyEngine';
import { stageStats } from '../../components/playground/PlanStage';
import { setFiguresHidden } from '../../lib/figuresPrivacy';
import { PLAYGROUND_PRICING, ceilTo } from '../../lib/playground/pricing';
import { studioStandard, saveNewVersion } from '../../lib/materialSpecs';
import { withRecipeSpecs } from '../../lib/lineSpecs';
import { buildDetailedBoqSnapshot } from '../../lib/detailedBoq';
import { issueDocument, signIssue } from '../../services/documentIssueEngine';
import { startPlanRevision, withPlanBoq, issuePlanRevision } from '../../lib/playground/revision';

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

function Harness({ tier = {}, focus = null, onSave = vi.fn(async () => undefined), probe, onSelect = vi.fn(), ctx0, probeCtx, bankIn, tiersIn, activeIn }: { tier?: any; focus?: any; onSave?: any; probe?: (tiers: any[], active: string) => void; onSelect?: any; ctx0?: any; probeCtx?: (ctx: any) => void; bankIn?: any[]; tiersIn?: any[]; activeIn?: string }) {
  const [tiers, setTiers] = useState<any[]>(tiersIn || [{ id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq(), ...tier }]);
  const [active, setActive] = useState(activeIn || 't1');
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

beforeEach(() => { org.playground = true; org.role = 'Super Admin'; specStore.bank = null; studio.settings = {}; studio.update = null; setFiguresHidden(false); try { localStorage.clear(); } catch { /* jsdom */ } });
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

  it('is every studio’s BOQ Editor: no switch brings the four modes back (PR 7b)', () => {
    for (const flag of [undefined, false]) {
      org.playground = flag;
      render(<Harness tier={PG} />);
      expect(screen.getByRole('radio', { name: /^Plan$/ })).toBeTruthy();
      for (const mode of ['Excel', 'Cards', 'Focus Editor', 'Plan Takeoff']) expect(screen.queryByRole('button', { name: mode })).toBeNull();
      expect(screen.getByRole('complementary', { name: 'Studio design library' })).toBeTruthy();
      cleanup();
    }
  });

  it('an older project opens as a Classic BOQ, with the Sheet, for a studio that never had the switch', () => {
    org.playground = undefined;
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /^Sheet$/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Classic BOQ · made before the Playground/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make a Playground version' })).toBeTruthy();
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

});

describe('Deal (PR P)', () => {
  const pays = () => document.querySelector('[data-deal-pays]')!.textContent;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const deal = () => screen.getByRole('region', { name: 'Deal' });

  it('offers off a part, off a room and complimentary lines: saved as the project’s offers, and Money shows the same client pays', async () => {
    let ctx: any = null;
    render(<Harness tier={PG} probeCtx={c => { ctx = c; }} />);
    lens('Deal');
    const before = pays();
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer off a part' }));
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Kitchen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer off a room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick lines' }));
    fireEvent.click(screen.getByLabelText('Wall paint in Bedroom, complimentary'));
    expect(within(deal()).getByText('5% off carpentry')).toBeTruthy();
    expect(within(deal()).getByText('10% off the Kitchen')).toBeTruthy();
    expect(within(deal()).getByText('Complimentary: Wall paint')).toBeTruthy();
    expect(pays()).not.toBe(before);
    expect(ctx.financials.discounts.map((d: any) => d.basis.kind)).toEqual(['part-percent', 'room-percent', 'complimentary']);

    /* Money & Offers reads the same list against the option as App prices it. */
    const { default: MoneyOffersTab } = await import('../../components/money/MoneyOffersTab');
    const { playgroundTierSummary } = await import('../../lib/playground/versions');
    const map = new Map(bank.map(b => [b.id, b]));
    const t: any = { id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq(), ...PG };
    const shown = pays();
    cleanup();
    render(<MoneyOffersTab tiers={[{ ...t, summary: playgroundTierSummary(t, map, ctx) }]} bank={bank} projectContext={ctx} setProjectContext={() => undefined} />);
    expect(screen.getByText('Client pays').nextElementSibling!.textContent).toBe(shown);
  });

  it('a special price lands on its target; another replaces it; the payment schedule adds up to it', () => {
    let ctx: any = null;
    render(<Harness tier={PG} probeCtx={c => { ctx = c; }} />);
    lens('Deal');
    const now = Number(pays()!.replace(/[^0-9]/g, ''));
    const target = Math.floor(now / 1000) * 1000 - 2000;
    fireEvent.change(screen.getByLabelText('Client pays'), { target: { value: target.toLocaleString('en-IN') } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the special price' }));
    // The first offer creates the financials record, and the GST on the work stays as it was.
    expect(ctx.financials.executionGstEnabled).toBe(true);
    expect(pays()).toBe(inr(target));
    expect(within(deal()).getByText(`Rounds what the client pays to ${inr(target)}`)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Payment schedule' })).getByText(inr(target))).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Client pays'), { target: { value: String(target - 5000) } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the special price' }));
    expect(pays()).toBe(inr(target - 5000));
    expect(within(deal()).getAllByText('Special price')).toHaveLength(2); // the offer, and its card
    // At or above what the client pays, it is refused.
    fireEvent.change(screen.getByLabelText('Client pays'), { target: { value: String(now * 2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the special price' }));
    expect(pays()).toBe(inr(target - 5000));
    expect(screen.getByRole('status').textContent).toMatch(/below/);
  });

  it('the offers follow the BOQ: a changed line re-prices them, and the special price still meets its target', () => {
    render(<Harness tier={PG} />);
    lens('Deal');
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer off a part' }));
    const target = Math.floor(Number(pays()!.replace(/[^0-9]/g, '')) / 1000) * 1000;
    fireEvent.change(screen.getByLabelText('Client pays'), { target: { value: String(target) } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the special price' }));
    const part = () => document.querySelector('[data-offer] b')!.textContent;
    const was = part();
    lens('Sheet');
    fireEvent.click(screen.getAllByText('Sliding wardrobe')[0]);
    const size = within(inspector()).getByRole('textbox', { name: 'Size' });
    fireEvent.change(size, { target: { value: '7 x 9' } });
    fireEvent.blur(size);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    lens('Deal');
    expect(part()).not.toBe(was);
    expect(pays()).toBe(inr(target));
  });

  it('the design fee, how long the proposal holds, and the initiation fee against the booking', () => {
    let ctx: any = null;
    render(<Harness tier={PG} probeCtx={c => { ctx = c; }} />);
    lens('Deal');
    const fee = screen.getByLabelText(/Design fee/);
    fireEvent.change(fee, { target: { value: '12' } });
    fireEvent.blur(fee);
    expect(ctx.designFee).toBe(12);
    const days = screen.getByLabelText('Proposal valid for');
    fireEvent.change(days, { target: { value: '21' } });
    fireEvent.blur(days);
    expect(ctx.proposal).toEqual({ validDays: 21 });
    const until = new Date(); until.setDate(until.getDate() + 21);
    expect(within(deal()).getByText(until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))).toBeTruthy();
    const booking = () => Number(document.querySelector('[data-deal-booking]')!.textContent!.replace(/[^0-9]/g, ''));
    const b0 = booking();
    const ret = screen.getByLabelText('Initiation fee paid');
    fireEvent.change(ret, { target: { value: '1,000' } });
    fireEvent.blur(ret);
    expect(ctx.financials).toMatchObject({ initiationFeePaid: 1000, executionGstEnabled: true });
    expect(booking()).toBe(b0 - 1000);
    expect(within(screen.getByRole('region', { name: 'Payment schedule' })).getByText(/less the ₹1,000 initiation fee/)).toBeTruthy();
  });

  it('an issued proposal past its date shows as expired', () => {
    const issuedAt = Date.now() - 20 * 864e5;
    render(<Harness tier={PG} ctx0={{ name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10, proposal: { issuedAt, validDays: 15, validUntil: issuedAt + 15 * 864e5 } }} />);
    lens('Deal');
    expect(within(deal()).getByText(/^Expired on/)).toBeTruthy();
    expect(screen.queryByLabelText('Proposal valid for')).toBeNull();
  });

  it('an earlier version’s deal is shown, not changed: it says why, and opens the newest version', () => {
    const onSelect = vi.fn();
    const t1 = { ...PG, id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq() };
    const t2 = { ...PG, id: 't2', name: 'Comfort Upgrade', timestamp: 2, parentTierId: 't1', boq: baseBoq() };
    render(<Harness tiersIn={[t1, t2]} activeIn="t1" onSelect={onSelect} />);
    lens('Deal');
    const why = screen.getByRole('note', { name: 'Why the deal is read-only' });
    expect(why.textContent).toMatch(/v1 is kept as it was.*Offers are made on v2/);
    fireEvent.click(within(why).getByRole('button', { name: 'Open v2' }));
    expect(onSelect).toHaveBeenCalledWith('t2');
    // It opens on the Deal lens, now changeable.
    expect(screen.getByRole('radio', { name: /^Deal$/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('note', { name: 'Why the deal is read-only' })).toBeNull();
    expect((screen.getByLabelText(/Design fee/) as HTMLInputElement).disabled).toBe(false);
  });

  it('a Designer sees the deal but cannot change it, and never the margin', () => {
    org.role = 'Designer';
    render(<Harness tier={PG} />);
    lens('Deal');
    expect(screen.getByRole('note', { name: 'Why the deal is read-only' }).textContent).toMatch(/Owner and the studio’s finance roles/);
    expect(pays()).toMatch(/^₹/);
    expect(screen.queryByText(/Margin on the work/)).toBeNull();
    expect((screen.getByLabelText(/Design fee/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('region', { name: 'Give an offer' }).className).toMatch(/pointer-events-none/);
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

  it('shows the three ways to start under the empty state, not squeezed beside its words', () => {
    /* A new project: rooms from the brief, none on a plan yet, its options made by the setup wizard (Classic). */
    const fresh = { ...noPlan, rooms: [{ name: 'Living', size: 180, unit: 'sq ft' }, { name: 'Bedroom', size: 130, unit: 'sq ft' }] };
    render(<Harness ctx0={fresh} />);
    lens('Plan');
    const words = screen.getByText('No plan yet').closest('.border-dashed') as HTMLElement;
    expect(words).toBeTruthy();
    for (const name of ['Sketch a rough plan', 'Quick build', 'Set up the plan']) {
      const btn = screen.getByRole('button', { name });
      // Beside the words they kept their full width and the words shrank to a column one letter wide.
      expect(words.contains(btn)).toBe(false);
    }
  });

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

describe('room kits (PR K)', () => {
  const kitBank = [
    ...bank,
    { id: 'b52', name: 'Remove existing floor tiles', cat: 'Civil', unit: 'sq ft', specs: 'Hacking the old tiles.', materials: 10, labor: 8, margin: 25 },
    { id: 'b53', name: 'Floor tiles, laid', cat: 'Flooring', unit: 'sq ft', specs: 'Vitrified tiles.', materials: 90, labor: 42, margin: 25 },
    { id: 'b54', name: 'Wall tiles to 7 ft, laid', cat: 'Tiling', unit: 'sq ft', specs: 'Wall tiles.', materials: 80, labor: 40, margin: 25 },
    { id: 'b55', name: 'Waterproofing, floor and upstand', cat: 'Civil', unit: 'sq ft', specs: 'Two coats.', materials: 30, labor: 22, margin: 25 },
    { id: 'b56', name: 'Debris removal', cat: 'Civil', unit: 'lot', specs: 'Carting away.', materials: 9000, labor: 5400, margin: 25 },
    { id: 'b25', name: 'Vanity unit with mirror', cat: 'Carpentry', unit: 'nos', specs: 'Vanity.', materials: 14000, labor: 4000, margin: 25 },
  ];
  const flat = [
    { name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } },
    { name: 'Bath 1', size: 28, unit: 'sq ft', plan: { x: 12, y: 0, w: 4, h: 7 } },
    { name: 'Bath 2', size: 35, unit: 'sq ft', plan: { x: 16, y: 0, w: 5, h: 7 } },
  ];
  const ctx0 = { name: 'Palacia – 3BHK', area: 465, rooms: flat, designFeeType: 'percentage', designFee: 10 };
  const bathKit = { id: 'k-bath', name: 'Bathroom renovation (full)', description: '', kinds: ['toilet'], itemIds: ['b52', 'b55', 'b53', 'b54', 'b25', 'b56'],
    items: [{ itemId: 'b52', fit: 'floorRemove' }, { itemId: 'b55', fit: 'waterproof' }, { itemId: 'b53', fit: 'floor' }, { itemId: 'b54', fit: 'walls7' }, { itemId: 'b25', fit: 'piece' }, { itemId: 'b56', fit: 'fixed' }] };
  const oldBundle = { id: 'old', name: 'Bedroom set', description: 'Saved before kits', itemIds: ['wardrobe', 'bed'] };
  const kitsTab = () => fireEvent.click(within(screen.getByRole('complementary', { name: 'Studio design library' })).getByRole('radio', { name: 'Kits' }));
  const dialog = () => screen.getByRole('dialog', { name: 'Apply a room kit' });

  it('a full bathroom renovation goes into both bathrooms in one step, each sized from its room; one undo takes it out', () => {
    studio.settings = { customBundles: [bathKit, oldBundle] };
    let latest: any[] = [];
    render(<Harness ctx0={ctx0} bankIn={kitBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    kitsTab();
    const lib = screen.getByRole('complementary', { name: 'Studio design library' });
    expect(within(lib).getByText('From the Item Bank’s bundles. Drop a kit on a room: every line is sized from that room.')).toBeTruthy();
    // The studio's own kits; the standard add-ons' items are not in this bank, so they are not offered.
    expect(Array.from(lib.querySelectorAll('[data-kit]')).map(e => e.getAttribute('data-kit'))).toEqual(['k-bath', 'old']);
    const card = lib.querySelector('[data-kit="k-bath"]') as HTMLElement;
    expect(within(card).getByText('6 items · civil and fittings')).toBeTruthy();
    expect(within(card).getByText(/^≈ ₹.* in the Bath 1$/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Apply Bathroom renovation (full)' }));
    const d = dialog();
    expect(within(d).getByText('Room kit · Item Bank → Room Bundles & Kits')).toBeTruthy();
    // Both bathrooms are picked; the bedroom is not offered.
    expect(within(d).getByRole('button', { name: 'Bath 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(d).getByRole('button', { name: 'Bath 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(d).queryByRole('button', { name: 'Bedroom' })).toBeNull();
    const b1 = within(d).getByRole('group', { name: 'Bath 1' });
    expect(within(b1).getByText('4′ × 7′ · 10′ high')).toBeTruthy();
    expect(within(b1).getByText('22′ of wall × 7′, less 1 door')).toBeTruthy();
    expect(within(b1).getByText('Placed on a free wall, 2′6″ wide')).toBeTruthy();
    // Untick the vanity in Bath 2.
    fireEvent.click(within(d).getByRole('checkbox', { name: 'Vanity unit with mirror in Bath 2' }));
    expect(within(d).getByText(/^9 lines/)).toBeTruthy();
    expect(within(d).getByText(/debris removal added once/)).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Add 9 lines' }));
    expect(screen.queryByRole('dialog', { name: 'Apply a room kit' })).toBeNull();
    const boq = latest[0].boq;
    expect(boq.filter((l: any) => l.roomId === 'Bath 1').map((l: any) => [l.bankId, l.qty])).toEqual([['b52', 28], ['b55', 50], ['b53', 28], ['b54', 133], ['b25', 1]]);
    expect(boq.filter((l: any) => l.roomId === 'Bath 2').map((l: any) => [l.bankId, l.qty])).toEqual([['b52', 35], ['b55', 59], ['b53', 35], ['b54', 147]]);
    expect(boq.filter((l: any) => l.bankId === 'b56')).toHaveLength(1);
    expect(boq.find((l: any) => l.bankId === 'b25').place).toBeTruthy();
    expect(screen.getByText('Bathroom renovation (full): 9 lines in Bath 1 and Bath 2, sized from each room. Debris removal added once, across the flat.')).toBeTruthy();
    // PR 7: every line it added prints into the Live BOQ, its piece drops into place and the first room glows; a kit floats no price.
    expect(document.querySelectorAll('.pg-print').length).toBeGreaterThanOrEqual(boq.length);
    expect(document.querySelector(`[data-piece="${boq.find((l: any) => l.bankId === 'b25').id}"] .pg-drop`)).toBeTruthy();
    expect(document.querySelector('.pg-glow')?.getAttribute('data-glow')).toBe('Bath 1');
    expect(document.querySelector('[data-price-tag]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(latest[0].boq).toHaveLength(0);
  });

  it('what a room already has is unticked and says so; a kit dropped on a room opens on that room', () => {
    studio.settings = { customBundles: [bathKit] };
    let latest: any[] = [];
    const vanity = { id: 'v1', bankId: 'b25', qty: 1, roomId: 'Bath 2' };
    render(<Harness ctx0={ctx0} bankIn={kitBank} tier={{ ...PG, boq: [vanity] }} probe={t => { latest = t; }} />);
    kitsTab();
    fireEvent.drop(stage(), { ...at(18, 3), dataTransfer: { getData: () => 'kit:k-bath', types: ['text/plain', 'application/x-room-kit'] } });
    const d = dialog();
    expect(within(d).getByRole('button', { name: 'Bath 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(d).getByRole('button', { name: 'Bath 1' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(d).queryByRole('group', { name: 'Bath 1' })).toBeNull();
    expect((within(d).getByRole('checkbox', { name: 'Vanity unit with mirror in Bath 2' }) as HTMLInputElement).checked).toBe(false);
    expect(within(d).getByText('Already in this room')).toBeTruthy();
    // A room put in and taken out from the chips.
    fireEvent.click(within(d).getByRole('button', { name: 'Bath 1' }));
    expect(within(d).getByRole('group', { name: 'Bath 1' })).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Bath 1' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Add 4 lines' }));
    expect(latest[0].boq.filter((l: any) => l.bankId === 'b25')).toHaveLength(1);
    expect(latest[0].boq.filter((l: any) => l.roomId === 'Bath 2' && l.civil).map((l: any) => l.civil.type)).toEqual(['floorRemove', 'waterproof', 'floor', 'walls7']);
    // A kit dropped outside every room says so; Esc closes a preview.
    fireEvent.drop(stage(), { ...at(30, 30), dataTransfer: { getData: () => 'kit:k-bath', types: ['text/plain'] } });
    expect(screen.getByText('Drop the kit inside a room.')).toBeTruthy();
  });

  it('a bundle saved before kits applies too: its pieces placed along a free wall; dropped on a room card', () => {
    studio.settings = { customBundles: [oldBundle] };
    let latest: any[] = [];
    render(<Harness ctx0={ctx0} bankIn={kitBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    lens('Rooms');
    fireEvent.drop(document.querySelector('[data-roomcard="Bedroom"]') as HTMLElement, { dataTransfer: { getData: () => 'kit:old' } });
    const d = dialog();
    expect(within(d).getByText('Room kit · Item Bank → Room Bundles & Kits')).toBeTruthy();
    // Any room may take it.
    expect(within(d).getAllByRole('button', { pressed: false }).map(b => b.textContent)).toEqual(['Bath 1', 'Bath 2']);
    fireEvent.click(within(d).getByRole('button', { name: 'Add 2 lines' }));
    const added = latest[0].boq.filter((l: any) => l.roomId === 'Bedroom');
    expect(added.map((l: any) => [l.bankId, !!l.place])).toEqual([['wardrobe', true], ['bed', true]]);
  });

  it('a room is saved to the Item Bank as a kit, each item with how it is sized', async () => {
    const update = vi.fn(async () => undefined);
    studio.settings = { customBundles: [oldBundle] };
    studio.update = update;
    const boq = [
      { id: 'w', bankId: 'b25', qty: 1, roomId: 'Bath 1', place: { x: 13, y: 0.2, rot: 0 } },
      { id: 'f', bankId: 'b53', qty: 28, roomId: 'Bath 1', civil: { type: 'floor' } },
    ];
    render(<Harness ctx0={ctx0} bankIn={kitBank} tier={{ ...PG, boq }} />);
    fireEvent.pointerDown(document.querySelector('[data-room="Bath 1"]') as Element, { ...at(14, 5), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(14, 5), pointerId: 1 });
    const ri = screen.getByRole('complementary', { name: 'Room' });
    await act(async () => { fireEvent.click(within(ri).getByRole('button', { name: 'Save this room as a kit' })); });
    expect(update).toHaveBeenCalledTimes(1);
    const [key, list] = (update.mock.calls[0] as any[]);
    expect(key).toBe('customBundles');
    expect(list[0]).toBe(oldBundle);
    expect(list[1]).toMatchObject({ name: 'Bath 1, Palacia', itemIds: ['b25', 'b53'], items: [{ itemId: 'b25', fit: 'piece' }, { itemId: 'b53', fit: 'floor' }], kinds: ['toilet'] });
    expect(screen.getByText('Saved to Item Bank → Room Bundles & Kits as “Bath 1, Palacia”: 2 items, each with how it is sized (on a free wall, the floor, walls to 7′).')).toBeTruthy();
  });
});

describe('bought by the client, and at actuals (PR X)', () => {
  const xBank = [
    ...bank,
    { id: 'b57', name: 'Light fittings', cat: 'Electrical', unit: 'lot', specs: 'Chosen with you, billed by the vendor at actual cost.', materials: 45000, labor: 0, margin: 0, supply: 'actuals' },
    { id: 'b58', name: 'Hob and chimney', cat: 'Appliances', unit: 'nos', specs: 'Chosen and bought by you; we plan the cut-outs and points.', materials: 38000, labor: 0, margin: 0, supply: 'client' },
  ];
  const byClient = () => fireEvent.click(within(screen.getByRole('complementary', { name: 'Studio design library' })).getByRole('radio', { name: 'By client' }));

  it('the By client tab adds to the room picked; the Live BOQ lists them apart and no figure moves', () => {
    let latest: any[] = [];
    render(<Harness bankIn={xBank} tier={PG} probe={t => { latest = t; }} />);
    const pays = () => screen.getByText('Client pays · work').nextElementSibling!.textContent;
    const before = pays();
    byClient();
    const lib = screen.getByRole('complementary', { name: 'Studio design library' });
    expect(within(lib).getByText(/^Bought by the client, or paid to the vendor at actuals\./)).toBeTruthy();
    // In the bank's order, an item at actuals with its estimate.
    expect(Array.from(lib.querySelectorAll('[data-supply-item]')).map(e => e.getAttribute('data-supply-item'))).toEqual(['b57', 'b58']);
    expect(within(lib).getByText('≈ ₹45,000 est.')).toBeTruthy();
    expect((within(lib).getByLabelText('Add to') as HTMLSelectElement).value).toBe('Whole flat');
    fireEvent.click(within(lib).getByRole('button', { name: 'Add Light fittings to Whole flat' }));
    expect(screen.getByText(`Light fittings added to Whole flat, at actuals. The price stays ${before}.`)).toBeTruthy();
    fireEvent.change(within(lib).getByLabelText('Add to'), { target: { value: 'Kitchen' } });
    fireEvent.click(within(lib).getByRole('button', { name: 'Add Hob and chimney to Kitchen' }));
    const boq = latest[0].boq;
    expect(boq.filter((l: any) => l.bankId === 'b57')).toEqual([expect.objectContaining({ roomId: 'Whole flat', qty: 1, boqStatus: 'as_actuals' })]);
    expect(boq.filter((l: any) => l.bankId === 'b58')).toEqual([expect.objectContaining({ roomId: 'Kitchen', qty: 1, boqStatus: 'client_procured' })]);
    expect(pays()).toBe(before);
    const live = screen.getByText('Separate · not in the price').closest('div.rounded-xl') as HTMLElement;
    expect(within(live).getByText('Whole flat · At actuals, paid to the vendor')).toBeTruthy();
    expect(within(live).getByText('Kitchen · Bought by the client')).toBeTruthy();
    expect(within(live).getByText('Actuals, estimated')).toBeTruthy();
    expect(within(live).getByText('On their own page for the client. No effect on the price, offers, fee, GST or the payment schedule.')).toBeTruthy();
    // The tier's summary: price and fee as before.
    expect(latest[0].boq.length).toBe(baseBoq().length + 2);
  });

  it('a supplied item added any other way (dropped from Pieces) is supplied too', () => {
    let latest: any[] = [];
    const sofaBank = [...bank, { id: 'sofa', name: 'Three-seater sofa, loose', cat: 'Furniture', unit: 'nos', specs: 'Fabric sofa.', materials: 55000, labor: 0, margin: 0, supply: 'client' }];
    render(<Harness bankIn={sofaBank} tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.drop(stage(), { ...at(6, 5), dataTransfer: { getData: () => 'sofa' } });
    expect(latest[0].boq[0]).toMatchObject({ bankId: 'sofa', roomId: 'Bedroom', boqStatus: 'client_procured' });
    expect(screen.getByText('Client pays · work').nextElementSibling!.textContent).toBe('₹0');
  });
});

describe('versions (PR R)', () => {
  const v1boq = () => [
    { ...placedWardrobe },
    { id: 'l2', bankId: 'paint', qty: 300, roomId: 'Bedroom' },
    { id: 'l3', bankId: 'counter', qty: 10, roomId: 'Kitchen' },
    { id: 'bed1', bankId: 'bed', qty: 1, roomId: 'Bedroom', place: { x: 6, y: 5, rot: 0 } },
  ];
  const v2boq = () => [
    { ...placedWardrobe, qty: 56, calcLength: 8 },
    { id: 'l2', bankId: 'paint', qty: 300, roomId: 'Bedroom' },
    { id: 'l3', bankId: 'counter', qty: 10, roomId: 'Kitchen', marginOverride: 20 },
    { id: 'n1', bankId: 'counter', qty: 4, roomId: 'Kitchen' },
  ];
  const t1 = { ...PG, id: 't1', name: 'Comfort Upgrade', timestamp: Date.UTC(2026, 10, 12), boq: v1boq() };
  const t2 = { ...PG, id: 't2', name: 'Comfort Upgrade', timestamp: Date.UTC(2026, 10, 15), parentTierId: 't1', boq: v2boq() };
  const verMenu = () => fireEvent.click(screen.getByRole('button', { name: /Comfort Upgrade · v2|Comfort Upgrade · v1|Comfort Upgrade · v3/ }));

  it('the version menu lists the option’s versions; Show changes since v1 marks every lens, and the parts add up', () => {
    let latest: any[] = [];
    render(<Harness tiersIn={[t1, t2]} activeIn="t2" probe={t => { latest = t; }} />);
    verMenu();
    expect(screen.getByText('Versions of Comfort Upgrade')).toBeTruthy();
    expect(screen.getByText('v2 · Draft')).toBeTruthy();
    expect(screen.getByText('Editing now')).toBeTruthy();
    expect(screen.getByText('v1 · Kept as it was')).toBeTruthy();
    expect(screen.getByText('12 Nov 2026 · read-only')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Show changes since v1'));
    const panel = screen.getByRole('region', { name: 'Changes' });
    expect(within(panel).getByText('Changes since v1')).toBeTruthy();
    // Each changed line, by room, tagged.
    const row = (id: string) => panel.querySelector(`[data-change="${id}"]`) as HTMLElement;
    expect(within(row('p1')).getByText('SIZE')).toBeTruthy();
    expect(within(row('p1')).getByText(/6′ × 7′ = 42 sq ft → 8′ × 7′ = 56 sq ft/)).toBeTruthy();
    expect(within(row('l3')).getByText('RATE')).toBeTruthy();
    expect(within(row('l3')).getByText('Markup 10.0% → 20.0%')).toBeTruthy();
    expect(within(row('n1')).getByText('NEW')).toBeTruthy();
    expect(within(row('bed1')).getByText('REMOVED')).toBeTruthy();
    expect(within(panel).getByText(/the parts add up exactly/)).toBeTruthy();
    // The plan: an outline on the changed pieces, the bed taken out drawn faint; Client pays says by how much.
    expect(document.querySelector('[data-changed="p1"]')).toBeTruthy();
    expect(document.querySelector('[data-ghost="bed1"]')).toBeTruthy();
    expect(screen.getByText(/vs v1$/)).toBeTruthy();
    // The Sheet: tags beside the names, and the line taken out struck through in its room.
    lens('Sheet');
    expect(document.querySelector('[data-gone="bed1"]')).toBeTruthy();
    // Rooms: what each room changed by.
    lens('Rooms');
    expect(within(document.querySelector('[data-roomcard="Kitchen"]') as HTMLElement).getByText(/vs v1$/)).toBeTruthy();
    // Restore puts the line back as it was.
    fireEvent.click(within(row('bed1')).getByRole('button', { name: 'Restore' }));
    expect(latest.find(t => t.id === 't2').boq.find((l: any) => l.id === 'bed1')).toMatchObject({ bankId: 'bed', place: { x: 6, y: 5 } });
  });

  it('an earlier version is kept as it was: read-only; New version keeps this one and opens the next', () => {
    let latest: any[] = []; let active = '';
    const { unmount } = render(<Harness tiersIn={[t1, t2]} activeIn="t1" />);
    expect(screen.getByText('v1 · kept as it was')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add items/ })).toBeNull();
    unmount();
    render(<Harness tiersIn={[t1, t2]} activeIn="t2" probe={(t, a) => { latest = t; active = a; }} />);
    verMenu();
    fireEvent.click(screen.getByRole('button', { name: /New version/ }));
    expect(latest).toHaveLength(3);
    const v3 = latest[2];
    expect(v3).toMatchObject({ parentTierId: 't2', name: 'Comfort Upgrade', lifecycleTag: 'Draft', boqFormat: 'playground' });
    expect(v3.boq).toEqual(latest[1].boq);
    expect(active).toBe(v3.id);
    expect(screen.getByText('v3 of Comfort Upgrade is ready to edit. v2 is kept as it was.')).toBeTruthy();
  });
});

describe('the Sheet shows a sized line’s width and height', () => {
  it('beside its quantity: 6′ × 7′ for the wardrobe; none for a count or a line shared into rooms', () => {
    render(<Harness tier={{ ...PG, boq: [placedWardrobe, { id: 'l3', bankId: 'counter', qty: 10, roomId: 'Kitchen', calcLength: 10, sizeUnit: 'ft' }, { id: 'b1', bankId: 'bed', qty: 1, roomId: 'Bedroom' }] }} />);
    lens('Sheet');
    expect((document.querySelector('[data-size="p1"]') as HTMLElement).textContent).toBe('6′ × 7′');
    expect((document.querySelector('[data-size="l3"]') as HTMLElement).textContent).toBe('10′ long');
    expect(document.querySelector('[data-size="b1"]')).toBeNull();
  });
});

describe('a signed BOQ revised on the plan (PR R2)', () => {
  const tier1 = () => ({ ...PG, id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq(), summary: {} });
  /* The project as signing a Playground version leaves it: Detailed BOQ v1, signed in the portal. */
  const signedCtx = () => {
    const ctx0: any = { name: 'Test flat', clientName: 'Meera Shah', area: 465, rooms, designFeeType: 'percentage', designFee: 10, scopeFlow: { enabled: true }, approvedTierId: 't1' };
    const snap = buildDetailedBoqSnapshot({ context: ctx0, tier: tier1(), bankMap: new Map(bank.map(b => [b.id, b])), version: 1, reference: 'PB-DB-2026-TF-01', approval: { mode: 'portal' } as any });
    let ctx = issueDocument('detailed_boq', snap, { issuedBy: 'Studio', reference: 'PB-DB-2026-TF-01' })(ctx0);
    ctx = signIssue(ctx.documents!.issues[0].id, { name: 'Meera Shah', signedAt: Date.UTC(2026, 10, 12) })(ctx);
    return ctx;
  };

  it('opens read-only on the plan; Start revision; each change needs a reason; Review and issue puts it in the client’s portal', async () => {
    let c: any = null; let latest: any[] = [];
    render(<Harness ctx0={signedCtx()} tiersIn={[tier1()]} activeIn="t1" probeCtx={x => { c = x; }} probe={t => { latest = t; }} />);
    expect(screen.getByText('Signed · 12 Nov 2026')).toBeTruthy();
    expect(screen.getByText('Signed · read-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add items/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start revision 1' }));
    expect(c.scopeRevisions).toHaveLength(1);
    expect(c.scopeRevisions[0]).toMatchObject({ number: 1, status: 'draft', baseTierId: 't1' });
    const panel = () => screen.getByRole('region', { name: 'Changes' });
    expect(within(panel()).getByText('Revision 1')).toBeTruthy();
    expect(within(panel()).getByText('Draft · against the signed BOQ')).toBeTruthy();
    expect(within(panel()).getByText('No changes yet')).toBeTruthy();
    // Changed on the plan: a wardrobe dropped in the bedroom. The signed version is untouched.
    fireEvent.drop(stage(), { ...at(6, 5), dataTransfer: { getData: () => 'wardrobe' } });
    fireEvent.keyDown(stage(), { key: 'Escape' });
    expect(latest[0].boq).toEqual(baseBoq());
    const added = c.scopeRevisions[0].playground.boq.find((l: any) => !baseBoq().some(b => b.id === l.id));
    expect(added).toMatchObject({ bankId: 'wardrobe', roomId: 'Bedroom' });
    expect(within(panel()).getByText('1 of 1 changes need a reason')).toBeTruthy();
    const row = panel().querySelector(`[data-change="${added.id}"]`) as HTMLElement;
    expect(within(row).getByText('NEW')).toBeTruthy();
    fireEvent.change(within(row).getByLabelText('Why it changed'), { target: { value: 'Client request' } });
    expect(c.scopeRevisions[0].playground.reasons[added.id]).toBe('Client request');
    expect(within(panel()).getByText('Every change has a reason')).toBeTruthy();
    // Review and issue: the change six ways, and what the client reads.
    fireEvent.click(within(panel()).getByRole('button', { name: /Review and issue/ }));
    const dialog = screen.getByRole('dialog', { name: 'Issue it to the client' });
    expect(within(dialog).getByText(/Scope revision 1 · PB-DB-2026-TF-01-REV-01/)).toBeTruthy();
    const six = dialog.querySelector('[data-six]') as HTMLElement;
    ['New items', 'Quantity', 'Rate', 'Redesigned', 'Compared by section', 'Removed', 'Adds up to'].forEach(t => expect(within(six).getByText(t)).toBeTruthy());
    expect(within(dialog).getByText('Client request')).toBeTruthy();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Issue to the client' })); });
    {
      const issue = c.documents.issues.find((i: any) => i.kind === 'scope_revision');
      expect(issue).toMatchObject({ reference: 'PB-DB-2026-TF-01-REV-01' });
      expect(issue.clientVisibility.state).toBe('published');
      expect(issue.snapshot.rooms.flatMap((r: any) => r.lines).map((l: any) => [l.tag, l.reason])).toEqual([['NEW', 'Client request']]);
      expect(c.scopeRevisions[0].status).toBe('issued');
      expect(within(panel()).getByText('With the client to sign')).toBeTruthy();
      // Withdrawn: a draft again.
      fireEvent.click(within(panel()).getByRole('button', { name: 'Withdraw to edit' }));
      expect(c.scopeRevisions[0].status).toBe('draft');
    }
  });

  it('signed by the client in the portal, it applies as the next version, drawn as revised, the contract in force', () => {
    let c: any = null; let latest: any[] = []; let active = '';
    let ctx = signedCtx();
    const t1 = tier1();
    const bm = new Map(bank.map(b => [b.id, b]));
    let rec = startPlanRevision({ base: t1 as any, number: 1, id: 'srev-1', by: 'Priya', at: 1, bankMap: bm, rooms: ctx.rooms });
    rec = withPlanBoq(rec, { boq: [...baseBoq(), placedWardrobe] as any[], reasons: { p1: 'Client request' } }, t1 as any, bm, ctx.rooms);
    const out = issuePlanRevision({ ctx: { ...ctx, scopeRevisions: [rec] }, rec, base: t1 as any, v1: ctx.documents!.issues[0], bankMap: bm, by: 'Priya', v2TierId: 'tv2' });
    if ('problem' in out) throw new Error(out.problem);
    ctx = out.update({ ...ctx, scopeRevisions: [rec] });
    ctx = signIssue(ctx.documents!.issues.find(i => i.kind === 'scope_revision')!.id, { name: 'Meera Shah', signedAt: 20 })(ctx);
    render(<Harness ctx0={ctx} tiersIn={[t1]} activeIn="t1" probeCtx={x => { c = x; }} probe={(t, a) => { latest = t; active = a; }} />);
    const panel = screen.getByRole('region', { name: 'Changes' });
    expect(within(panel).getByText('Signed by the client')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Apply revision 1' }));
    expect(latest.map(t => [t.id, t.lifecycleTag])).toEqual([['t1', 'Superseded'], ['tv2', 'Current contract']]);
    expect(latest[1]).toMatchObject({ boqFormat: 'playground', parentTierId: 't1' });
    expect(latest[1].boq.find((l: any) => l.id === 'p1').place).toEqual(placedWardrobe.place);
    expect(active).toBe('tv2');
    expect(c.approvedTierId).toBe('tv2');
    expect(c.scopeRevisions[0].status).toBe('applied');
    expect(screen.getByText(/Revision 1 applied: it is the contract in force/)).toBeTruthy();
  });
});

describe('The first proposal (PR P)', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'First proposal PDF preview' });
  const num = (t: string | null | undefined) => Number(String(t).replace(/[^0-9]/g, ''));

  it('opens from the bar: the work as Money prices it, the client pays as the Deal lens says, no cost, markup or drawing', async () => {
    let ctx: any = null;
    render(<Harness tier={{ ...PG, boq: [...baseBoq(), placedWardrobe] }} probeCtx={c => { ctx = c; }} />);
    lens('Deal');
    fireEvent.click(screen.getByRole('button', { name: 'Add the offer off a part' }));
    const pays = document.querySelector('[data-deal-pays]')!.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Proposal PDF/ }));
    const d = dialog();
    const { playgroundTierSummary } = await import('../../lib/playground/versions');
    const t: any = { id: 't1', boq: [...baseBoq(), placedWardrobe], ...PG };
    expect(num(d.querySelector('[data-pdf-work]')!.textContent)).toBe(playgroundTierSummary(t, new Map(bank.map(b => [b.id, b])), ctx).totalSell);
    expect(d.querySelector('[data-pdf-pays]')!.textContent).toBe(pays);
    expect(within(d).getByText('5% off carpentry')).toBeTruthy();
    // The drawn wardrobe's quantity carries its size, width × height.
    expect([...d.querySelectorAll('[data-pdf-qty]')].map(c => c.textContent)).toContain('6 ft × 7 ft42');
    expect(d.querySelectorAll('[data-pdf-page]').length).toBeGreaterThanOrEqual(7);
    expect(d.textContent).not.toMatch(/markup|margin/i);
    // The drawing gate: no piece and no plan drawing on any page.
    expect(d.querySelector('[data-piece]')).toBeNull();
    expect(within(d).queryByRole('application')).toBeNull();
    // Annexure A last, with the validity.
    const pages = [...d.querySelectorAll('[data-pdf-page]')];
    expect(pages.at(-1)!.textContent).toMatch(/This proposal is valid for 15 days/);
  });

  it('the brief follows the cover; shaped for the overall budget, the investment comes straight after it', () => {
    render(<Harness tier={PG} />);
    fireEvent.click(screen.getByRole('button', { name: /Proposal PDF/ }));
    const page = (i: number) => dialog().querySelectorAll('[data-pdf-page]')[i].textContent;
    expect(page(1)).toMatch(/What you told us/);
    expect(page(2)).toMatch(/From this proposal to your keys/);
    fireEvent.change(within(dialog()).getByLabelText(/Shaped for/), { target: { value: 'Overall Budget' } });
    expect(page(1)).toMatch(/What you told us/);
    expect(page(2)).toMatch(/Your investment₹/);
  });

  it('Send on WhatsApp records the proposal on the project, and the sent version is kept as it went', async () => {
    let ctx: any = null;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Harness tier={PG} probeCtx={c => { ctx = c; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Proposal PDF/ }));
    await act(async () => { fireEvent.click(within(dialog()).getByRole('button', { name: 'Send on WhatsApp' })); });
    expect(pdfMock.save).toHaveBeenCalled();
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(ctx.proposal).toMatchObject({ tierId: 't1', validDays: 15, shapedFor: 'Itemized Costs' });
    expect(ctx.proposal.validUntil - ctx.proposal.issuedAt).toBe(15 * 864e5);
    expect(within(dialog()).getByText(/^Sent /)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.getAllByText(/kept as it went/).length).toBeGreaterThan(0);
    lens('Deal');
    const why = screen.getByRole('note', { name: 'Why the deal is read-only' });
    expect(why.textContent).toMatch(/went to the client/);
    expect(within(why).getByRole('button', { name: 'New version' })).toBeTruthy();
    open.mockRestore();
  });

  it('Present to the client opens the first proposal while the layout is not approved', () => {
    render(<Harness tier={PG} />);
    lens('Deal');
    fireEvent.click(screen.getByRole('button', { name: 'Present to the client' }));
    expect(dialog()).toBeTruthy();
  });
});

describe('The meeting view (PR P)', () => {
  const approvedLayout = { steps: [{ id: 'space_planning_approved', status: 'done' }] } as any;
  const withJourney = (el: React.ReactElement) => <JourneyContext.Provider value={approvedLayout}>{el}</JourneyContext.Provider>;
  const meeting = () => screen.getByRole('dialog', { name: 'Presenting the proposal' });
  const specsLine = () => withRecipeSpecs({ ...placedWardrobe } as any, bank[0], specStore.bank, 'C');

  it('before the layout is approved, Present is the PDF: no drawing reaches the client', () => {
    render(<Harness tier={PG} />);
    expect(screen.queryByRole('button', { name: /^Present$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Proposal PDF/ }));
    expect(screen.queryByRole('dialog', { name: 'Presenting the proposal' })).toBeNull();
  });

  it('once it is, Present opens the meeting: chapters, the rooms drawn, the client pays as the Deal lens says, the price detail saved', () => {
    let ctx: any = null;
    render(withJourney(<Harness tier={{ ...PG, boq: [...baseBoq(), placedWardrobe] }} probeCtx={c => { ctx = c; }} />));
    lens('Deal');
    const pays = document.querySelector('[data-deal-pays]')!.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Present to the client' }));
    const d = meeting();
    expect(d.querySelector('[data-meeting-pays]')!.textContent).toBe(pays);
    const chapters = within(within(d).getByRole('navigation', { name: 'Chapters' })).getAllByRole('button').map(b => b.textContent);
    expect(chapters).toEqual(['Welcome', 'Your home', 'Bedroom', 'Kitchen', 'Materials', 'Investment', 'Next step']);
    expect(d.textContent).not.toMatch(/markup|margin/i);
    fireEvent.click(within(d).getByRole('radio', { name: 'Every line' }));
    expect(ctx.proposal.priceDetail).toBe('lines');
    fireEvent.click(within(d).getByRole('button', { name: 'Exit' }));
    expect(screen.queryByRole('dialog', { name: 'Presenting the proposal' })).toBeNull();
    // The bar's button is Present now; the PDF stays in Export.
    expect(screen.getByRole('button', { name: /^Present$/ })).toBeTruthy();
  });

  it('the client approves the option: it becomes the approved option, as Approve Option does', () => {
    let ctx: any = null; let latest: any[] = [];
    render(withJourney(<Harness tier={PG} probeCtx={c => { ctx = c; }} probe={t => { latest = t; }} />));
    fireEvent.click(screen.getByRole('button', { name: /^Present$/ }));
    fireEvent.click(within(meeting()).getByRole('button', { name: 'Next step' }));
    fireEvent.click(within(meeting()).getByRole('button', { name: 'The client approves Comfort Upgrade' }));
    expect(ctx.approvedTierId).toBe('t1');
    expect(latest[0]).toMatchObject({ lifecycleTag: 'Current contract', approval: { by: 'Priya Shah' } });
    expect(within(meeting()).getByText('Approved by the client')).toBeTruthy();
  });

  it('a finish the client asks for is priced, and the asks become the next version', () => {
    specStore.bank = studioStandard();
    const onSelect = vi.fn(); let latest: any[] = [];
    render(withJourney(<Harness tier={{ ...PG, boq: [specsLine()] }} onSelect={onSelect} probe={t => { latest = t; }} />));
    fireEvent.click(screen.getByRole('button', { name: /^Present$/ }));
    fireEvent.click(within(meeting()).getByRole('button', { name: 'Bedroom' }));
    const tiles = within(within(meeting()).getByRole('group', { name: 'Finish for Sliding wardrobe' })).getAllByRole('button');
    const pick = tiles.find(t => t.getAttribute('aria-pressed') === 'false')!;
    fireEvent.click(pick);
    expect(within(meeting()).getByText(/^1 change/)).toBeTruthy();
    fireEvent.click(within(meeting()).getByRole('button', { name: 'Next step' }));
    fireEvent.click(within(meeting()).getByRole('button', { name: 'Make a new version with 1 change' }));
    expect(latest).toHaveLength(2);
    expect(onSelect).toHaveBeenCalledWith(latest[1].id);
    const was = latest[0].boq[0].materialSpecs, now = latest[1].boq[0].materialSpecs;
    expect(JSON.stringify(now)).not.toBe(JSON.stringify(was));
    expect(Object.values(now).map((x: any) => x.id)).toContain(specStore.bank.materials.find((m: any) => m.name === pick.getAttribute('title'))!.id);
  });
});

describe('motion (PR 7, as the approved mockup)', () => {
  const printed = () => [...document.querySelectorAll('.pg-print')].map(e => e.textContent || '');
  const tag = () => document.querySelector('[data-price-tag]');
  const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

  it('a piece added: it drops onto the plan, the room glows, the price floats up and its line prints into the lenses; then it all stops', async () => {
    let latest: any[] = [];
    render(<Harness tier={{ ...PG, boq: [] }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Sliding wardrobe to Bedroom' }));
    const line = latest[0].boq[0], id = line.id;
    expect(piece(id).querySelector('.pg-drop')).toBeTruthy();
    expect(document.querySelector('.pg-glow')?.getAttribute('data-glow')).toBe('Bedroom');
    // The tag says what the piece did to the price: on an empty BOQ, its own amount, rounded up to ₹100.
    expect(tag()?.textContent).toBe(`+₹${ceilTo(line.qty * 1680, 100).toLocaleString('en-IN')}`);
    expect(tag()?.className).toContain('bg-emerald-600');
    lens('Rooms');
    expect(printed().some(t => t.includes('Sliding wardrobe'))).toBe(true);
    lens('Plan');
    await wait(1800);
    expect(printed()).toEqual([]);
    expect(tag()).toBeNull();
    expect(document.querySelector('.pg-glow')).toBeNull();
    expect(piece(id).querySelector('.pg-drop')).toBeNull();
  });

  it('pulling a handle floats the change in price from the piece; moving it within its room shows nothing', async () => {
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} />);
    fireEvent.pointerDown(piece('p1'), { ...at(3.12, 1.12), pointerId: 1 });
    fireEvent.pointerUp(stage(), { ...at(3.12, 1.12), pointerId: 1 });
    await drag(screen.getByLabelText('Resize from the right'), [6.12, 1.12], [8.12, 1.12]);
    // 42 → 56 sq ft at ₹1,680 a sq ft (₹1,400 at 20% margin), each rounded up to ₹100.
    expect(tag()?.textContent).toBe(`+₹${(ceilTo(56 * 1680, 100) - ceilTo(42 * 1680, 100)).toLocaleString('en-IN')}`);
    await wait(1800);
    await drag(piece('p1'), [4, 1.12], [5, 4], { altKey: true });
    expect(tag()).toBeNull();
    expect(document.querySelector('.pg-glow')).toBeNull();
  });

  it('a piece moved into another room makes that room glow', async () => {
    render(<Harness tier={{ ...PG, boq: [placedWardrobe] }} />);
    await drag(piece('p1'), [3.12, 1.12], [17, 1.5]);
    expect(document.querySelector('.pg-glow')?.getAttribute('data-glow')).toBe('Kitchen');
  });

  it('a line added in the Sheet prints in there too; Undo shows nothing', async () => {
    render(<Harness tier={PG} />);
    lens('Sheet');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pick Wall paint' }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete/ }));
    await wait(1800);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByText('Wall paint').length).toBeGreaterThan(0);
    expect(printed()).toEqual([]);
    // Duplicated from the inspector, the copy prints into the Sheet.
    fireEvent.click(screen.getAllByText('Kitchen counter')[0]);
    fireEvent.click(within(inspector()).getByRole('button', { name: /Duplicate/ }));
    expect(document.querySelectorAll('tr.pg-print').length).toBe(1);
  });
});
