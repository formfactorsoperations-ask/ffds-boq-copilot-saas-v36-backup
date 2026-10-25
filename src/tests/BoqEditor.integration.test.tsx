/*
  The BOQ editor and Pricing & Tiers, rendered with live state.

  These are the four things the studio reported, driven the way a person
  drives them: delete a row in the Excel view (and undo it), type a size and
  watch the quantity follow, press Save and get a save rather than a download,
  and read the same price for an option everywhere on Pricing & Tiers.
*/
import React, { useMemo, useState } from 'react';
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah', email: 'priya@example.com' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../services/geminiService', () => ({
  estimateQuantity: vi.fn(), isAiAvailable: () => false, refineItemSpecs: vi.fn(), generateLumpsumBreakdown: vi.fn(),
}));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import StudioDashboard from '../../components/StudioDashboard';
import TierManager from '../../components/TierManager';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';
import { calculateSellPrice, formatCurrency } from '../../lib/utils';
import { INITIAL_BANK } from '../../constants';

const bank: any[] = [
  { id: 'wardrobe', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Laminate finish', materials: 1000, labor: 400, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', specs: 'Emulsion', materials: 20, labor: 10, margin: 25 },
  { id: 'counter', name: 'Kitchen counter', cat: 'Modular Kitchen', unit: 'rft', specs: 'Granite', materials: 1500, labor: 500, margin: 10 },
];

const rooms = [
  { name: 'Bedroom', size: 120, unit: 'sq ft' },
  { name: 'Kitchen', size: 80, unit: 'sq ft' },
];

const baseBoq = () => [
  { id: 'l1', bankId: 'wardrobe', qty: 40, roomId: 'Bedroom', baseRate: 1000 },
  { id: 'l2', bankId: 'paint', qty: 300, roomId: 'Bedroom' },
  { id: 'l3', bankId: 'counter', qty: 10, roomId: 'Kitchen' },
];

/** The summary App computes for every tier (tiersWithCalculatedSummaries), with a 10% design fee. */
const withSummaries = (tiers: any[], bankMap: Map<string, any>) => tiers.map(t => {
  const totalSell = boqTotal(t.boq, bankMap);
  const designFee = totalSell * 0.1;
  return { ...t, summary: { totalSell, totalCost: totalSell * 0.8, totalGm: 20, itemCount: t.boq.length, designFee, totalRevenue: totalSell + designFee, blendedGm: 27.3 } };
});

function EditorHarness({ frozen = false, onSave = vi.fn(async () => undefined), probe }: { frozen?: boolean; onSave?: any; probe?: (tiers: any[]) => void }) {
  const [tiers, setTiers] = useState<any[]>([{ id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: baseBoq() }]);
  const [ctx, setCtx] = useState<any>({ name: 'Test flat', area: 465, rooms, boqFrozen: frozen, designFeeType: 'percentage', designFee: 10 });
  const bankMap = useMemo(() => buildBankMap(bank), []);
  const calculated = useMemo(() => withSummaries(tiers, bankMap), [tiers, bankMap]);
  probe?.(tiers);
  return (
    <StudioDashboard
      projectContext={ctx}
      setProjectContext={setCtx}
      tiers={calculated}
      setTiers={setTiers as any}
      activeTierId="t1"
      bank={bank}
      aiStrategy={'balanced' as any}
      onViewInBank={() => undefined}
      onSaveProject={onSave}
      projectId=""
    />
  );
}

const openExcel = () => fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
/** The line in the Focus Editor deck (the catalog on the right lists the same names). */
const clickLine = (name: string) => fireEvent.click(screen.getAllByText(name)[0]);
const lineIds = (tiers: any[]) => tiers[0].boq.map((l: any) => l.id);

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Excel view: deleting a row', () => {
  it('deletes the row and undoes it back into the same place', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Wall paint' }));
    expect(lineIds(latest)).toEqual(['l1', 'l3']);
    expect(screen.queryByText('Wall paint')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Deleted 1 line');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);
    expect(screen.getByText('Wall paint')).toBeTruthy();
  });

  it('deletes several selected rows from the selection bar', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const boxes = screen.getAllByRole('checkbox');
    // [0] is select-all; rows follow in sheet order.
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    expect(lineIds(latest)).toEqual(['l3']);
    expect(screen.getByRole('status').textContent).toContain('Deleted 2 lines');
  });

  it('Set Linkage on a selection links every selected line', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Set Linkage' }));
    fireEvent.click(screen.getByRole('button', { name: 'DRAWING' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. DWG-ELEC-04'), { target: { value: 'DWG-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Linkage' }));
    const linked = latest[0].boq.filter((l: any) => l.linkage?.refId === 'DWG-07').map((l: any) => l.id);
    expect(linked.sort()).toEqual(['l1', 'l2']);
  });

  it('a frozen BOQ asks for a change order instead of losing the line', () => {
    let latest: any[] = [];
    render(<EditorHarness frozen probe={t => { latest = t; }} />);
    openExcel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wall paint' }));
    expect(screen.getByText('Bulk Apply Status')).toBeTruthy();
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);

    // With a CO reference and reason, the line is marked Deleted — still on the BOQ, out of the price.
    fireEvent.change(screen.getByPlaceholderText('e.g. CO-005'), { target: { value: 'CO-7' } });
    fireEvent.change(screen.getByPlaceholderText('Why is this change happening?'), { target: { value: 'Client dropped it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Bulk Change' }));
    const paint = latest[0].boq.find((l: any) => l.id === 'l2');
    expect(paint.boqStatus).toBe('deleted');
    expect(paint.statusHistory[0]).toMatchObject({ to: 'deleted', changeOrderRef: 'CO-7' });
  });
});

describe('Size works out the quantity', () => {
  it('Excel: typing 7 x 8 on a sq ft line sets qty 56', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const cells = screen.getAllByRole('textbox', { name: 'Size' });
    fireEvent.focus(cells[0]);
    fireEvent.change(cells[0], { target: { value: '7 x 8' } });
    fireEvent.blur(cells[0]);
    const wardrobe = latest[0].boq.find((l: any) => l.id === 'l1');
    expect(wardrobe).toMatchObject({ qty: 56, calcLength: 7, calcWidth: 8, sizeUnit: 'ft' });
  });

  it('Excel: millimetres off a drawing convert', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    fireEvent.click(screen.getByRole('button', { name: 'mm' }));
    const cell = screen.getAllByRole('textbox', { name: 'Size' })[0];
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: '2100 x 2400' } });
    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.blur(cell);
    expect(latest[0].boq[0].qty).toBeCloseTo(54.25, 2);
  });

  it('Excel: a size it cannot read is flagged and changes nothing', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const cell = screen.getAllByRole('textbox', { name: 'Size' })[0];
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: 'big one' } });
    fireEvent.blur(cell);
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    expect(latest[0].boq[0].qty).toBe(40);
  });

  it('Focus Editor: width and height on the selected line set the quantity', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    clickLine('Wardrobe');
    const panel = screen.getByTestId('size-panel');
    fireEvent.change(within(panel).getByLabelText('Width (ft)'), { target: { value: '7' } });
    fireEvent.change(within(panel).getByLabelText('Height (ft)'), { target: { value: '8' } });
    expect(latest[0].boq[0]).toMatchObject({ qty: 56, calcLength: 7, calcWidth: 8 });
    expect(within(panel).getByTestId('size-working').textContent).toContain('7 × 8 ft = 56 sq ft');
  });

  it('Focus Editor: a running-foot item asks for a length only', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByText('All Rooms combined'));
    clickLine('Kitchen counter');
    const panel = screen.getByTestId('size-panel');
    expect(within(panel).queryByLabelText(/Height/)).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'mm' }));
    fireEvent.change(within(panel).getByLabelText('Length (mm)'), { target: { value: '3048' } });
    expect(latest[0].boq.find((l: any) => l.id === 'l3').qty).toBeCloseTo(10, 2);
  });
});

describe('Save changes', () => {
  it('saves through the app and never downloads a file', async () => {
    const onSave = vi.fn(async () => undefined);
    const createUrl = vi.fn(() => 'blob:x');
    (URL as any).createObjectURL = createUrl;
    render(<EditorHarness onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save changes/ })); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.getByText(/^Saved /)).toBeTruthy();
  });

  it('says so when the save fails', async () => {
    const onSave = vi.fn(async () => { throw new Error('offline'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<EditorHarness onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save changes/ })); });
    expect(screen.getByRole('alert').textContent).toContain("Couldn't save");
  });
});

describe('BOQ editor total matches Pricing & Tiers', () => {
  it('shows the tier total with the design fee, split out', () => {
    render(<EditorHarness />);
    const work = boqTotal(baseBoq(), buildBankMap(bank));
    const total = Math.round(work * 1.1);
    expect(screen.getByTestId('boq-grand-total').textContent).toContain(total.toLocaleString('en-IN'));
    expect(screen.getByTestId('boq-total-split').textContent).toContain('design fee');
  });
});

describe('Pricing & Tiers: one price per option', () => {
  function PricingHarness() {
    const bankMap = buildBankMap(bank);
    const raw = [
      { id: 'ess', name: 'Essential Elegance', timestamp: 1, boq: [
        { id: 'a', bankId: 'wardrobe', qty: 30, baseRate: 900, rationale: 'Base spec: 0.8mm laminate' },
        { id: 'b', bankId: 'paint', qty: 300 },
      ] },
      { id: 'com', name: 'Comfort Upgrade', timestamp: 2, boq: [
        { id: 'c', bankId: 'wardrobe', qty: 30, baseRate: 1100, labor: 450, rationale: 'Mid spec: 1mm laminate' },
        { id: 'd', bankId: 'paint', qty: 300 },
        { id: 'e', bankId: 'counter', qty: 10 },
        { id: 'f', bankId: 'counter', qty: 99, boqStatus: 'excluded' },
      ] },
    ];
    const [tiers, setTiers] = useState<any[]>(withSummaries(raw, bankMap));
    const [ctx, setCtx] = useState<any>({ name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10 });
    const [active, setActive] = useState<string | null>('com');
    return (
      <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive}
        projectContext={ctx} setProjectContext={setCtx} bank={bank} setActiveTab={() => undefined} />
    );
  }

  it('the option card, the coverage total, the sidebar and the header agree', () => {
    render(<PricingHarness />);
    const work = boqTotal([
      { id: 'c', bankId: 'wardrobe', qty: 30, baseRate: 1100, labor: 450 },
      { id: 'd', bankId: 'paint', qty: 300 },
      { id: 'e', bankId: 'counter', qty: 10 },
      { id: 'f', bankId: 'counter', qty: 99, boqStatus: 'excluded' },
    ], buildBankMap(bank));
    // The excluded counter line is not in the price.
    expect(work).toBeCloseTo(calculateSellPrice(1100, 450, 20) * 30 + calculateSellPrice(20, 10, 25) * 300 + calculateSellPrice(1500, 500, 10) * 10, 6);
    const quoted = formatCurrency(Math.round(work * 1.1));

    expect(screen.getByTestId('coverage-total-com').textContent).toBe(quoted);
    // Header figure and sidebar both print the same quoted price.
    expect(screen.getAllByText(new RegExp(quoted.replace(/[₹,]/g, m => '\\' + m))).length).toBeGreaterThanOrEqual(2);
    const splits = screen.getAllByTestId('option-split').map(n => n.textContent);
    expect(splits.some(t => t!.includes(formatCurrency(Math.round(work))))).toBe(true);
  });

  it('an empty option says 0 items and 0% GM, not invented figures', () => {
    render(<PricingHarness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByText(/0\.0% GM • 0 items/)).toBeTruthy();
  });
});

/* The rest of Pricing & Tiers: figures that were invented, approvals nobody
   recorded, a Sync that lost the booked contract, a Regenerate with no way back. */
function TierHarness({ projects, useBank = bank, probe }: { projects?: any[]; useBank?: any[]; probe?: (s: { ctx: any; tiers: any[] }) => void }) {
  const bankMap = useMemo(() => buildBankMap(useBank), [useBank]);
  const [tiers, setTiers] = useState<any[]>(() => [
    { id: 'ess', name: 'Essential Elegance', timestamp: 1, boq: [{ id: 'a', bankId: 'wardrobe', qty: 30 }] },
    { id: 'com', name: 'Comfort Upgrade', timestamp: 2, boq: [{ id: 'c', bankId: 'wardrobe', qty: 40 }, { id: 'd', bankId: 'paint', qty: 300 }] },
  ]);
  const calc = useMemo(() => withSummaries(tiers, bankMap), [tiers, bankMap]);
  const [ctx, setCtx] = useState<any>({ name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10, config: '1BHK' });
  const [active, setActive] = useState<string | null>('ess');
  probe?.({ ctx, tiers });
  return (
    <TierManager tiers={calc} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive}
      projectContext={ctx} setProjectContext={setCtx} bank={useBank} setActiveTab={() => undefined}
      projects={projects} projectId="me" />
  );
}

const otherProject = (id: string, name: string, area: number, gm: number) => ({
  id, activeTierId: 't', context: { name, area },
  tiers: [{ id: 't', name: 'T', timestamp: 1, boq: [], summary: { totalRevenue: 900000, totalSell: 820000, blendedGm: gm, itemCount: 14 } }],
});

describe('Pricing & Tiers: only real benchmarks', () => {
  it('with no other projects it says so, and invents none', () => {
    render(<TierHarness projects={[]} />);
    expect(screen.queryByText(/median/i)).toBeNull();
    expect(screen.queryByText(/Majiwada|Hiranandani/)).toBeNull();
    expect(screen.getByText('No other priced projects to compare yet')).toBeTruthy();
    expect(screen.getByText(/No other priced projects yet/)).toBeTruthy();
  });

  it("uses the studio's own projects for the median and the comparables, never this one", () => {
    render(<TierHarness projects={[
      otherProject('me', 'Test flat', 465, 99),
      otherProject('p1', 'Andheri 2BHK', 700, 20),
      otherProject('p2', 'Thane 1BHK', 480, 24),
      otherProject('p3', 'Powai 3BHK', 1400, 30),
    ]} />);
    expect(screen.getByText('studio median 24.0%')).toBeTruthy();
    expect(screen.getByText('Thane 1BHK')).toBeTruthy();
    expect(screen.getByText('Andheri 2BHK')).toBeTruthy();
    expect(screen.queryByText('Powai 3BHK')).toBeNull();
    expect(screen.getByText(/pts vs studio median/)).toBeTruthy();
  });
});

describe('Pricing & Tiers: approving and syncing', () => {
  it('Approve records who approved it and when', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    const ess = state.tiers.find((t: any) => t.id === 'ess');
    expect(ess.approval.by).toBe('Priya Shah');
    expect(screen.getByText(/approved by Priya Shah on/)).toBeTruthy();
    expect(screen.queryByText(/by Anish/)).toBeNull();
  });

  it('Sync to a different option keeps a snapshot of the booked contract', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    const booked = state.ctx.financials.approvedExecutionValue;
    // Move to the other option and sync it.
    fireEvent.click(screen.getAllByText('Comfort Upgrade')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Sync to Payments & Revisions/ }));
    expect(state.ctx.approvedTierId).toBe('com');
    expect(state.ctx.financials.paymentSnapshots).toEqual([
      expect.objectContaining({ tierId: 'ess', approvedExecutionValue: booked }),
    ]);
    expect(state.tiers.find((t: any) => t.id === 'ess').lifecycleTag).toBe('Superseded');
  });
});

describe('Pricing & Tiers: Regenerate can be undone', () => {
  it('puts the old options back', () => {
    let state: any;
    render(<TierHarness useBank={INITIAL_BANK as any} probe={s => { state = s; }} />);
    const before = state.tiers.map((t: any) => t.id);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate and replace/ }));
    expect(state.tiers.map((t: any) => t.id)).not.toEqual(before);
    expect(screen.getByRole('status').textContent).toContain('Regenerated');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(state.tiers.map((t: any) => t.id)).toEqual(before);
  });
});

describe('Cards view on a frozen BOQ', () => {
  it('the card delete is switched off and says why', () => {
    render(<EditorHarness frozen />);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    const del = screen.getByRole('button', { name: 'Delete Wardrobe' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.title).toContain('change order');
  });

  it('on a live BOQ the card delete removes the line, with undo', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wardrobe' }));
    expect(lineIds(latest)).toEqual(['l2', 'l3']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);
  });
});
