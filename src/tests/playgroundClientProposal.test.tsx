/*
  The Client Proposal for a Playground option (BOQ Playground PR P2c): the
  first-proposal PDF, the meeting view and the portal from one place, with one
  switch for how much price the client sees; the material specifications built
  from the BOQ; and the portal's scope priced as Money reads it.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant', orgName: 'Test Studio' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: {} }));
vi.mock('../../services/engagementService', async (orig) => ({ ...(await orig() as any), getPaymentStructure: vi.fn(async () => null), getTermsSettings: vi.fn(async () => null) }));
vi.mock('../../components/ops/ProposalAcceptanceCard', () => ({ default: () => null }));
const specStore: { bank: any } = { bank: null };
vi.mock('../../services/materialSpecsService', () => ({
  watchMaterialSpecs: (_t: string, onBank: (b: any) => void) => { onBank(specStore.bank); return () => {}; },
  saveMaterialSpecs: vi.fn(async () => undefined),
}));

import ClientTab from '../../components/client/ClientTab';
import { JourneyContext } from '../../services/journeyEngine';
import { PLAYGROUND_PRICING, docPricingOf } from '../../lib/playground/pricing';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { buildClientBoqRows } from '../../lib/clientBoq';
import { specTable } from '../../lib/playground/proposal';
import { studioStandard, saveNewVersion, currentVersion } from '../../lib/materialSpecs';
import { withRecipeSpecs } from '../../lib/lineSpecs';

afterEach(cleanup);

const bank: any[] = [
  { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Walnut', materials: 1000, labor: 400, margin: 20 },
  { id: 'paint', name: 'Wall paint', cat: 'Painting', unit: 'sq ft', specs: 'Emulsion', materials: 20, labor: 10, margin: 25 },
];
const bankMap = new Map(bank.map(b => [b.id, b]));
const rooms = [{ name: 'Bedroom', size: 120, unit: 'sq ft', plan: { x: 0, y: 0, w: 12, h: 10 } }];
const boq = () => [
  { id: 'l1', bankId: 'w', qty: 40.3, roomId: 'Bedroom', calcLength: 5.9, calcWidth: 6.83, sizeUnit: 'ft' },
  { id: 'l2', bankId: 'paint', qty: 301, roomId: 'Bedroom' },
];
const PG = { boqFormat: 'playground', pricingRules: PLAYGROUND_PRICING };
const tier = (): any => ({ id: 't1', name: 'Comfort Upgrade', timestamp: 1, boq: boq(), ...PG, summary: { totalSell: 1, designFee: 0 } });

function Harness({ probe, booked, onRelease }: { probe?: (ctx: any) => void; booked?: boolean; onRelease?: any }) {
  const [ctx, setCtx] = useState<any>({ name: 'Palacia', rooms, designFeeType: 'percentage', designFee: 10 });
  probe?.(ctx);
  const tab = <ClientTab tiers={[tier()]} bank={bank} materialSuggestions={[]} timelinePhases={[]} setTimelinePhases={() => undefined} projectContext={ctx} setProjectContext={setCtx} onReleasePortal={onRelease} userName="Priya Shah" />;
  return booked ? <JourneyContext.Provider value={{ steps: [{ id: 'design_fee_received', status: 'done' }] } as any}>{tab}</JourneyContext.Provider> : tab;
}
const panel = () => screen.getByRole('region', { name: 'Client proposal, built from the Playground' });
const pdf = () => screen.getByRole('dialog', { name: 'First proposal PDF preview' });

describe('the Client Proposal of a Playground option', () => {
  it('is built from the Playground; the classic proposal is one click away', () => {
    render(<Harness />);
    expect(within(panel()).getByText('Built from the Playground')).toBeTruthy();
    expect(within(panel()).getByText(/has not booked/)).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Meeting view' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Publish to the portal' })).toBeNull();
    expect(document.querySelector('.proposal-container')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the classic proposal' }));
    expect(document.querySelector('.proposal-container')).toBeTruthy();
  });

  it('one switch for the price detail, which the PDF follows', () => {
    let ctx: any = null;
    render(<Harness probe={c => { ctx = c; }} />);
    fireEvent.click(within(panel()).getByRole('button', { name: 'First proposal PDF' }));
    expect(within(pdf()).getAllByText('Rate').length).toBeGreaterThan(0);
    fireEvent.click(within(pdf()).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(panel()).getByRole('radio', { name: 'Package only' }));
    expect(ctx.proposal.priceDetail).toBe('package');
    fireEvent.click(within(panel()).getByRole('button', { name: 'First proposal PDF' }));
    const d = pdf();
    expect(within(d).queryAllByText('Rate')).toHaveLength(0);
    expect(within(d).queryByText(/Bedroom total/)).toBeNull();
    // The investment, all in, is still there.
    expect(d.querySelector('[data-pdf-pays]')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(panel()).getByRole('radio', { name: 'Room totals' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'First proposal PDF' }));
    expect(within(pdf()).queryAllByText('Rate')).toHaveLength(0);
    expect(within(pdf()).getByText('Bedroom total')).toBeTruthy();
  });

  it('once the client has booked, Publish to the portal writes their copy', async () => {
    const onRelease = vi.fn(async () => undefined);
    render(<Harness booked onRelease={onRelease} />);
    await act(async () => { fireEvent.click(within(panel()).getByRole('button', { name: 'Publish to the portal' })); });
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(within(panel()).getByRole('status').textContent).toMatch(/portal now has this proposal/);
  });
});

describe('the portal’s scope, priced as Money reads it', () => {
  it('a Playground version’s rows are rounded line by line and add up to the option’s work', () => {
    const t = tier();
    const pricing = docPricingOf(t, rooms as any, bankMap);
    const rows = buildClientBoqRows({ boq: t.boq, bank, rooms, pricing });
    rows.forEach(r => expect(r.total % 100).toBe(0));
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(playgroundTierSummary(t, bankMap, { rooms } as any).totalSell);
    // A Classic one is as it always was: rate × qty.
    const classic = buildClientBoqRows({ boq: t.boq, bank, rooms });
    expect(classic[0].total).toBeCloseTo(classic[0].rate * 40.3, 6);
  });
});

describe('the material specifications, built from the BOQ', () => {
  it('the option’s own grade from its lines, with their versions; the others from the recipes; older specs counted', () => {
    let specs = studioStandard();
    const w = withRecipeSpecs({ id: 'l1', bankId: 'w', qty: 40, roomId: 'Bedroom' } as any, bank[0], specs, 'C');
    const ply = Object.values(w.materialSpecs!)[0];
    const t: any = { ...tier(), boq: [w, boq()[1]] };
    let s = specTable(specs, t, bankMap, { C: 'Comfort Upgrade' })!;
    expect(s.grades.map(g => [g.grade, g.fromBoq])).toEqual([['E', false], ['C', true], ['P', false]]);
    expect(s.grades[1].name).toBe('Comfort Upgrade');
    expect(s.rows.length).toBeGreaterThan(2);
    expect(s.stale).toBe(0);
    // A newer version of a material the line uses: the line is counted as on an older spec.
    specs = saveNewVersion(specs, ply.id, { words: 'newer words', brand: 'X', note: 'n' } as any, 'Owner', 2);
    s = specTable(specs, t, bankMap)!;
    expect(s.stale).toBe(1);
    const cell = s.rows.flatMap(r => r.cells[1]).find(c => c.mat === ply.id)!;
    expect(cell.versions).toEqual([ply.v]);
    expect(cell.current).toBe(currentVersion(specs, ply.id)!.v);
    expect(specTable(null, t, bankMap)).toBeNull();
  });
});
