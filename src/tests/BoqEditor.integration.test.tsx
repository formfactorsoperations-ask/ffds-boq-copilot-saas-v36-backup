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
function TierHarness({ projects, useBank = bank, probe, ctx: extraCtx }: { projects?: any[]; useBank?: any[]; probe?: (s: { ctx: any; tiers: any[] }) => void; ctx?: any }) {
  const bankMap = useMemo(() => buildBankMap(useBank), [useBank]);
  const [tiers, setTiers] = useState<any[]>(() => [
    { id: 'ess', name: 'Essential Elegance', timestamp: 1, boq: [{ id: 'a', bankId: 'wardrobe', qty: 30 }] },
    { id: 'com', name: 'Comfort Upgrade', timestamp: 2, boq: [{ id: 'c', bankId: 'wardrobe', qty: 40 }, { id: 'd', bankId: 'paint', qty: 300 }] },
  ]);
  const calc = useMemo(() => withSummaries(tiers, bankMap), [tiers, bankMap]);
  const [ctx, setCtx] = useState<any>({ name: 'Test flat', area: 465, rooms, designFeeType: 'percentage', designFee: 10, config: '1BHK', ...extraCtx });
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

describe('Pricing & Tiers: an approval can be reverted', () => {
  it('with nothing approved before, the option is a draft again and nothing is approved', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert approval' }));
    expect(screen.getByTestId('revert-approval-confirm').textContent).toMatch(/Nothing will be approved/);
    fireEvent.click(screen.getByRole('button', { name: 'Revert to draft' }));
    expect(state.ctx.approvedTierId).toBeUndefined();
    const ess = state.tiers.find((t: any) => t.id === 'ess');
    expect(ess.lifecycleTag).toBe('Draft');
    expect(ess.approval).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Approve Option' })).toBeTruthy();
  });

  it('after a re-approval, the contract it replaced is the baseline again', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    const booked = state.ctx.financials.approvedExecutionValue;
    fireEvent.click(screen.getAllByText('Comfort Upgrade')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert approval' }));
    expect(screen.getByTestId('revert-approval-confirm').textContent).toMatch(/Essential Elegance becomes the approved baseline again/);
    fireEvent.click(screen.getByRole('button', { name: 'Revert to draft' }));
    expect(state.ctx.approvedTierId).toBe('ess');
    expect(state.ctx.financials.approvedExecutionValue).toBe(booked);
    expect(state.ctx.financials.paymentSnapshots).toEqual([]);
    expect(state.tiers.find((t: any) => t.id === 'ess').lifecycleTag).toBe('Current contract');
    expect(state.tiers.find((t: any) => t.id === 'com').lifecycleTag).toBe('Draft');
  });

  it('Keep approval leaves it approved', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert approval' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep approval' }));
    expect(state.ctx.approvedTierId).toBe('ess');
    expect(screen.queryByTestId('revert-approval-confirm')).toBeNull();
  });
});

describe('Pricing & Tiers: renaming an option', () => {
  it('the Rename button on the card renames it', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(input, { target: { value: '  Essential Plus  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.tiers.find((t: any) => t.id === 'ess').name).toBe('Essential Plus');
  });

  it('the pencil by the heading renames it, and an approved option can be renamed', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename option' }));
    const input = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(input, { target: { value: 'Comfort Final' } });
    fireEvent.blur(input);
    expect(state.tiers.find((t: any) => t.id === 'ess').name).toBe('Comfort Final');
    expect(state.ctx.approvedTierId).toBe('ess');
  });

  it('keeps the option\'s material spec edits, and the name it was created with', () => {
    let state: any;
    // An edit saved under the option's name, as edits were before they were kept by id.
    const overrides = { 'Hardware System': { 'Essential Elegance': 'Hettich soft-close', 'Comfort Upgrade': 'Ebco' } };
    render(<TierHarness probe={s => { state = s; }} ctx={{ proposalContent: { materials: { overrides } }, proposalContentByMode: { TURNKEY: { materials: { overrides } } } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(input, { target: { value: 'Essential Plus' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const ess = state.tiers.find((t: any) => t.id === 'ess');
    expect(ess).toMatchObject({ name: 'Essential Plus', originalName: 'Essential Elegance' });
    for (const content of [state.ctx.proposalContent, state.ctx.proposalContentByMode.TURNKEY]) {
      expect(content.materials.overrides['Hardware System']).toEqual({ ess: 'Hettich soft-close', 'Comfort Upgrade': 'Ebco' });
    }
    // A second rename keeps the first name as the one it was created with.
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const again = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(again, { target: { value: 'Essential Max' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(state.tiers.find((t: any) => t.id === 'ess').originalName).toBe('Essential Elegance');
  });

  it('Duplicate gives the copy the original\'s material spec edits, as its own', () => {
    let state: any;
    const overrides = { 'Hardware System': { ess: 'Hettich soft-close' }, 'Paint Finish': { 'Essential Elegance': 'Royale Shyne' } };
    render(<TierHarness probe={s => { state = s; }} ctx={{ proposalContent: { materials: { overrides } }, proposalContentByMode: { TURNKEY: { materials: { overrides } } } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const copy = state.tiers.find((t: any) => t.name === 'Essential Elegance (Copy)');
    expect(copy.parentTierId).toBe('ess');
    for (const content of [state.ctx.proposalContent, state.ctx.proposalContentByMode.TURNKEY]) {
      expect(content.materials.overrides['Hardware System']).toEqual({ ess: 'Hettich soft-close', [copy.id]: 'Hettich soft-close' });
      expect(content.materials.overrides['Paint Finish']).toEqual({ 'Essential Elegance': 'Royale Shyne', [copy.id]: 'Royale Shyne' });
    }
  });

  it('a blank name, or Escape, keeps the old name', () => {
    let state: any;
    render(<TierHarness probe={s => { state = s; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    let input = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.tiers.find((t: any) => t.id === 'ess').name).toBe('Essential Elegance');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    input = screen.getByRole('textbox', { name: 'Option name' });
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(state.tiers.find((t: any) => t.id === 'ess').name).toBe('Essential Elegance');
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

/*
  Every number box in the editor, typed the way a keyboard types: clear the
  box, then each key appends to what it shows. The Excel view's Cost used to
  show the labour once cleared, so typing 3200 wrote ₹40,02,800 of material.
*/
const typeInto = (el: HTMLInputElement, text: string) => {
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: '' } });
  for (const k of text) fireEvent.change(el, { target: { value: el.value + k } });
  fireEvent.blur(el);
};
const unitCost = (l: any) => Math.round(((l.baseRate ?? 0) + (l.labor ?? 400)) * 100) / 100;

describe('Number boxes keep what is typed', () => {
  it('Excel Cost: clearing and typing 3200 sets the unit cost to 3200, split as before', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const cost = screen.getByLabelText('Unit cost of Wardrobe') as HTMLInputElement;
    expect(cost.value).toBe('1400');
    typeInto(cost, '3200');
    const w = latest[0].boq.find((l: any) => l.id === 'l1');
    expect(unitCost(w)).toBe(3200);
    // 1000 : 400 is kept.
    expect(w.baseRate).toBeCloseTo(2285.71, 2);
    expect(w.labor).toBeCloseTo(914.29, 2);
    expect(cost.value).toBe('3200');
  });

  it('Excel Cost below the labour is taken as typed, not raised to the labour', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    typeInto(screen.getByLabelText('Unit cost of Wardrobe') as HTMLInputElement, '300');
    expect(unitCost(latest[0].boq[0])).toBe(300);
  });

  it('Excel Cost reads "3,200"', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    typeInto(screen.getByLabelText('Unit cost of Wardrobe') as HTMLInputElement, '3,200');
    expect(unitCost(latest[0].boq[0])).toBe(3200);
  });

  it('Excel Qty and Margin take decimals with no stray 0', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    openExcel();
    const qty = screen.getByLabelText('Quantity of Wardrobe') as HTMLInputElement;
    typeInto(qty, '2.5');
    expect(qty.value).toBe('2.5');
    const margin = screen.getByLabelText('Margin of Wardrobe') as HTMLInputElement;
    typeInto(margin, '12.5');
    expect(margin.value).toBe('12.5');
    expect(latest[0].boq[0]).toMatchObject({ qty: 2.5, marginOverride: 12.5 });
  });

  it('Focus Editor: quantity, total unit cost, material and labour', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    clickLine('Wardrobe');
    typeInto(screen.getByLabelText('Quantity') as HTMLInputElement, '7.5');
    expect(latest[0].boq[0].qty).toBe(7.5);
    // Decimals used to round away: 3200.5 became 3201.
    typeInto(screen.getByLabelText('Total unit cost') as HTMLInputElement, '3200.5');
    expect(unitCost(latest[0].boq[0])).toBe(3200.5);
    typeInto(screen.getByLabelText('Material rate') as HTMLInputElement, '1999.5');
    expect(latest[0].boq[0].baseRate).toBe(1999.5);
    typeInto(screen.getByLabelText('Labour rate') as HTMLInputElement, '750');
    expect(latest[0].boq[0].labor).toBe(750);
  });

  it('Focus Editor: the deck quantity', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    typeInto(screen.getByLabelText('Quantity of Wardrobe') as HTMLInputElement, '0.5');
    expect(latest[0].boq[0].qty).toBe(0.5);
  });

  it('Size panel: a dimension under 1 keeps its 0', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    clickLine('Wardrobe');
    const panel = screen.getByTestId('size-panel');
    fireEvent.click(within(panel).getByRole('button', { name: 'm' }));
    const w = within(panel).getByLabelText('Width (m)') as HTMLInputElement;
    typeInto(w, '0.6');
    expect(w.value).toBe('0.6');
    typeInto(within(panel).getByLabelText('Height (m)') as HTMLInputElement, '0.9');
    expect(latest[0].boq[0].qty).toBeCloseTo(5.81, 2);
  });

  it("Cards: the material cost box changes the line's price (it wrote a field nothing reads)", () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    fireEvent.click(screen.getAllByTitle('Advanced Settings')[0]);
    fireEvent.click(screen.getByText('1000'));
    const box = document.activeElement as HTMLInputElement;
    for (const k of '1250') fireEvent.change(box, { target: { value: (box.value === '1000' ? '' : box.value) + k } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const w = latest[0].boq.find((l: any) => l.id === 'l1');
    expect(w.baseRate).toBe(1250);
    expect(boqTotal([w], buildBankMap(bank))).toBeCloseTo(calculateSellPrice(1250, 400, 20) * 40, 6);
  });

  it('The global margin box can be cleared and retyped', () => {
    let latest: any[] = [];
    render(<EditorHarness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByTitle('Set Global Margin'));
    typeInto(screen.getByLabelText('Margin % for all items') as HTMLInputElement, '18');
    fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
    expect(latest[0].boq.every((l: any) => l.marginOverride === 18)).toBe(true);
  });
});

describe('Keys inside an Excel cell belong to the cell', () => {
  it('Enter in a cell saves it without ticking the row; Space is not swallowed', () => {
    render(<EditorHarness />);
    openExcel();
    const cost = screen.getByLabelText('Unit cost of Wardrobe') as HTMLInputElement;
    fireEvent.focus(cost);
    const enter = fireEvent.keyDown(cost, { key: 'Enter' });
    expect(enter).toBe(false); // the box handles Enter itself
    const size = screen.getAllByRole('textbox', { name: 'Size' })[0];
    const space = fireEvent.keyDown(size, { key: ' ' });
    expect(space).toBe(true); // not prevented: the space reaches the box
    const rowBox = screen.getAllByRole('checkbox')[1] as HTMLInputElement;
    expect(rowBox.checked).toBe(false);
  });

  it('Space on the row itself still selects it', () => {
    render(<EditorHarness />);
    openExcel();
    const row = document.getElementById('item-l1')!;
    fireEvent.keyDown(row, { key: ' ' });
    expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).checked).toBe(true);
  });
});
