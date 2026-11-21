/*
  Regenerate, in Pricing & Tiers.

  A bathroom overhaul arrived in every bathroom on Regenerate: the project's
  civil scope, read off its site state, was one line of small print in the
  window. The window now lists the civil and site work as switches, and a
  choice made there is kept on the project.

  With every option deleted the screen said "Loading..." for ever. It now
  offers Add option and Make the options.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'test-tenant' }, currentRole: 'Super Admin', currentRoles: ['Super Admin'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../contexts/PageHeaderContext', () => ({ usePageHeader: () => undefined }));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: {}, loading: false, updateSettings: vi.fn() }) }));
vi.mock('../../hooks/useZohoBooks', () => ({ useZohoBooks: () => ({ status: null, connected: false, unknown: false, loading: false, refresh: vi.fn(), setStatus: vi.fn(), tenantId: null }) }));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/dbService', () => ({ db: new Proxy({}, { get: () => async () => [] }) }));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import TierManager from '../../components/TierManager';
import { INITIAL_BANK } from '../../constants';
import { INITIAL_TEMPLATES } from '../../lib/standardPackages';
import { quickBuild } from '../../lib/playground/quickBuild';

afterEach(cleanup);

const bank = INITIAL_BANK as any[];
let n = 0;
const rooms = quickBuild({ size: '3-BHK', carpet: 1050, bank, newId: () => `r${++n}` }).rooms;
const ctx0: any = { name: 'Flat', area: 1050, config: '3-BHK', rooms, ceilingHeight: 9.5, planSheet: { source: 'blocks' }, floorplanImage: 'x', propertyStatus: 'semi_finished' };
const option = (id: string, name: string): any => ({
  id, name, timestamp: 1, boq: [],
  summary: { totalSell: 0, designFee: 0, totalRevenue: 0, totalCost: 0, totalGm: 0, itemCount: 0, blendedGm: 0 },
});
const nameOf = (id: string) => bank.find(i => i.id === id)?.name || '';
const overhaul = (tier: any) => (tier.boq || []).filter((l: any) => /BBC/i.test(nameOf(l.bankId))).length;

function Tiers({ start, probe }: { start: any[]; probe: (t: any[], c: any) => void }) {
  const [tiers, setTiers] = useState<any[]>(start);
  const [ctx, setCtx] = useState<any>(ctx0);
  const [active, setActive] = useState<string | null>(start[0]?.id || null);
  probe(tiers, ctx);
  return <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive}
    projectContext={ctx} setProjectContext={setCtx} bank={bank} setActiveTab={() => undefined} templates={INITIAL_TEMPLATES} />;
}

describe('Regenerate lists the civil and site work it will add', () => {
  it('shows each as a switch, set as the project has it', () => {
    render(<Tiers start={[option('a', 'Comfort Upgrade')]} probe={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    // A semi-finished flat: bathrooms, kitchen civil, rewiring, false ceiling and painting; floors and plumbing are in.
    expect((screen.getByLabelText(/Overhaul bathrooms/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Replace flooring/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Painting/) as HTMLInputElement).checked).toBe(true);
  });

  it('left as it is, every bathroom gets its overhaul, as before', () => {
    let tiers: any[] = [], ctx: any = null;
    render(<Tiers start={[option('a', 'Comfort Upgrade')]} probe={(t, c) => { tiers = t; ctx = c; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate and replace' }));
    expect(tiers).toHaveLength(3);
    tiers.forEach(t => expect(overhaul(t)).toBe(3));
    expect(ctx.civilScope).toBeUndefined();
  });

  it('unticked, no option gets it, and the project remembers', () => {
    let tiers: any[] = [], ctx: any = null;
    render(<Tiers start={[option('a', 'Comfort Upgrade')]} probe={(t, c) => { tiers = t; ctx = c; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    fireEvent.click(screen.getByLabelText(/Overhaul bathrooms/));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate and replace' }));
    expect(tiers).toHaveLength(3);
    tiers.forEach(t => expect(overhaul(t)).toBe(0));
    expect(ctx.civilScope.bathrooms).toBe(false);
    // The rest of the scope is as it was.
    expect(ctx.civilScope.painting).toBe(true);
    // Opened again, the switch is still off.
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect((screen.getByLabelText(/Overhaul bathrooms/) as HTMLInputElement).checked).toBe(false);
  });
});

describe('a project with no options', () => {
  it('offers to make them, where it said "Loading..."', () => {
    let tiers: any[] = [];
    render(<Tiers start={[]} probe={t => { tiers = t; }} />);
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByText('No options yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make the options' }));
    const dlg = screen.getByText('Regenerate options').closest('div') as HTMLElement;
    fireEvent.click(within(dlg).getByRole('button', { name: 'Regenerate' }));
    expect(tiers).toHaveLength(3);
    expect(screen.queryByText('No options yet')).toBeNull();
  });

  it('or starts an empty one', () => {
    let tiers: any[] = [];
    render(<Tiers start={[]} probe={t => { tiers = t; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(tiers).toHaveLength(1);
  });
});
