/*
  The BOQ Playground (PR 3a) in the BOQ Editor, with the studio's switch on.

  The four modes become three lenses. Each test drives one action the old
  modes had, from its new home, the way a person would; and the switch off
  brings the four modes back exactly as they were.

    Focus Editor  → Rooms lens, Workspace (deck, inspector, library, bundles)
    Excel         → Sheet lens
    Cards         → Rooms lens, Cards
    Plan Takeoff  → Plan lens (the plan, then the takeoff)
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
import { buildBankMap } from '../../lib/boqPricing';
import { setFiguresHidden } from '../../lib/figuresPrivacy';
import { PLAYGROUND_PRICING, ceilTo } from '../../lib/playground/pricing';

const bank: any[] = [
  { id: 'wardrobe', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Laminate finish', materials: 1000, labor: 400, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', specs: 'Emulsion', materials: 20, labor: 10, margin: 25 },
  { id: 'counter', name: 'Kitchen counter', cat: 'Modular Kitchen', unit: 'rft', specs: 'Granite', materials: 1500, labor: 500, margin: 10 },
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

const lens = (name: 'Sheet' | 'Rooms' | 'Plan') => fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
const lineIds = (tiers: any[]) => tiers[0].boq.map((l: any) => l.id);

beforeEach(() => { org.playground = true; org.role = 'Super Admin'; setFiguresHidden(false); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); });

describe('three lenses replace the four modes', () => {
  it('shows Sheet, Rooms and Plan, and no mode buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: /Sheet/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Rooms/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Plan/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cards' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Focus Editor/ })).toBeNull();
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

  it('opened at a line (the slide-over), it opens on Sheet', () => {
    render(<Harness focus={{ ids: ['l2'], at: 1 }} />);
    expect(screen.getByRole('radio', { name: /Sheet/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('textbox', { name: 'Size' }).length).toBeGreaterThan(0);
  });
});

describe('Sheet lens: the Excel actions', () => {
  it('deletes a row and undoes it', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wall paint' }));
    expect(lineIds(latest)).toEqual(['l1', 'l3']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);
  });

  it('a typed size sets the quantity', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    const cell = screen.getAllByRole('textbox', { name: 'Size' })[0];
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: '7 x 8' } });
    fireEvent.blur(cell);
    expect(latest[0].boq[0]).toMatchObject({ qty: 56, calcLength: 7, calcWidth: 8 });
  });

  it('Set Linkage on a selection', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    lens('Sheet');
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Set Linkage' }));
    fireEvent.click(screen.getByRole('button', { name: 'DRAWING' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. DWG-ELEC-04'), { target: { value: 'DWG-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Linkage' }));
    expect(latest[0].boq.filter((l: any) => l.linkage?.refId === 'DWG-07').length).toBe(1);
  });
});

describe('Rooms lens: the Focus Editor and the cards', () => {
  it('Workspace: the inspector’s size panel sets the quantity', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getAllByText('Wardrobe')[0]);
    const panel = screen.getByTestId('size-panel');
    fireEvent.change(within(panel).getByLabelText('Width (ft)'), { target: { value: '7' } });
    fireEvent.change(within(panel).getByLabelText('Height (ft)'), { target: { value: '8' } });
    expect(latest[0].boq[0]).toMatchObject({ qty: 56 });
  });

  it('Cards: the card delete removes the line, with undo', () => {
    let latest: any[] = [];
    render(<Harness probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('radio', { name: /Cards/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wardrobe' }));
    expect(lineIds(latest)).toEqual(['l2', 'l3']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(lineIds(latest)).toEqual(['l1', 'l2', 'l3']);
  });

  it('shows each room’s share of the work', () => {
    render(<Harness tier={{ boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING }} />);
    const bedroom = (1000 + 400) * 1.2 * 40 + (20 + 10) * 1.25 * 300;
    expect(screen.getByText('By room')).toBeTruthy();
    // Each line rounded up to ₹100, then added: 67,200 + 11,300.
    expect(ceilTo((1000 + 400) * 1.2 * 40) + ceilTo((20 + 10) * 1.25 * 300)).toBe(78500);
    expect(bedroom).toBe(78450);
    expect(screen.getAllByText('₹ 78,500').length).toBeGreaterThan(0);
  });
});

describe('Plan lens: the plan and the takeoff', () => {
  it('shows the plan with its rooms, and the takeoff under it', () => {
    render(<Harness />);
    lens('Plan');
    expect(screen.getByText('The plan')).toBeTruthy();
    expect(screen.getByText('2 of 2 on the plan')).toBeTruthy();
    expect(screen.getAllByText(/Bedroom/).length).toBeGreaterThan(0);
  });
});

describe('The toolbar', () => {
  it('Save changes saves through the app', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<Harness onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save changes/ })); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('Classic and Playground versions', () => {
  it('an older option opens as a Classic BOQ, at exact amounts', () => {
    render(<Harness />);
    expect(screen.getByText('Classic BOQ')).toBeTruthy();
    expect(screen.getByText('Exact amounts')).toBeTruthy();
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
    expect(screen.getByText('Playground BOQ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make a Playground version' })).toBeNull();
  });
});

describe('Who sees what', () => {
  it('shows the margin to the studio’s finance roles', () => {
    render(<Harness />);
    expect(screen.getByText('Margin')).toBeTruthy();
  });

  it('Hide figures hides cost and margin', () => {
    setFiguresHidden(true);
    render(<Harness />);
    expect(screen.queryByText('Margin')).toBeNull();
    expect(screen.queryByText(/^Cost ₹/)).toBeNull();
  });

  it('a Designer never sees them', () => {
    org.role = 'Designer';
    render(<Harness />);
    expect(screen.queryByText('Margin')).toBeNull();
  });
});

describe('Across the flat', () => {
  it('adds painting as walls and ceilings measured from the plan', () => {
    let latest: any[] = [];
    render(<Harness tier={{ boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add painting from the plan' }));
    const added = latest[0].boq.slice(3);
    expect(added.map((l: any) => [l.bankId, l.byRoom.basis, l.roomId])).toEqual([['paint', 'wallPaint', 'Whole flat'], ['paint', 'ceilingPaint', 'Whole flat']]);
    expect(added[0].qty).toBeGreaterThan(0);
    expect(screen.getByText('Walls, from the plan')).toBeTruthy();
  });

  it('shares a whole-flat line into rooms, takes a room out, and puts it back to one figure', () => {
    let latest: any[] = [];
    const flat = [...baseBoq(), { id: 'l4', bankId: 'paint', qty: 900, roomId: 'Whole flat' }];
    render(<Harness tier={{ boq: flat }} probe={t => { latest = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Wall paint into rooms' }));
    const shared = latest[0].boq.find((l: any) => l.id === 'l4');
    expect(shared.byRoom.basis).toBe('wallPaint');
    const both = shared.qty;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kitchen takes a share of Wall paint' }));
    const fewer = latest[0].boq.find((l: any) => l.id === 'l4');
    expect(fewer.byRoom.rooms.Kitchen).toEqual({ on: false });
    expect(fewer.qty).toBeLessThan(both);
    fireEvent.click(screen.getByRole('button', { name: 'One figure for the flat' }));
    expect(latest[0].boq.find((l: any) => l.id === 'l4').byRoom).toBeUndefined();
  });
});
