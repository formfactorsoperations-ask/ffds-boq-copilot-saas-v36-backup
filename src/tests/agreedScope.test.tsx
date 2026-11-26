/*
  Palacia, a legacy project: the client accepted the proposal and paid D1 on
  Comfort Upgrade v1, but no option was approved. Versions & Revision Studio said
  "No signed scope yet" and offered nothing, and Pricing & Tiers could approve
  only the newest version, which already held the workshop's additions.
*/
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't' }, currentRole: 'Owner', currentRoles: ['Owner'], currentUserAuth: { displayName: 'Priya Shah' } }),
}));
vi.mock('../../components/SuccessWithNextToast', () => ({ showSuccessWithNext: vi.fn() }));

import ScopeWorkspace from '../../components/scope/ScopeWorkspace';
import TierManager from '../../components/TierManager';
import { agreedScopeCandidate } from '../../lib/tierApproval';

afterEach(cleanup);

const item = (id: string, name: string, cat: string, materials: number) => ({ id, name, cat, unit: 'sqft', materials, labor: 0, margin: 0 }) as any;
const BANK = [item('w', 'Wardrobe', 'Carpentry', 1000), item('p', 'Wall paint', 'Painting', 100)];
const tier = (id: string, name: string, boq: any[], sell: number, extra: any = {}) =>
  ({ id, name, timestamp: 1, boq, summary: { totalSell: sell, totalCost: sell * 0.8, itemCount: boq.length, designFee: sell * 0.12, totalRevenue: sell * 1.12, blendedGm: 20 }, ...extra }) as any;
const V1 = tier('v1', 'Comfort Upgrade', [{ id: 'a', bankId: 'w', qty: 10, roomId: 'Bed' }], 10000, { timestamp: 10 });
const V2 = tier('v2', 'Comfort Upgrade', [{ id: 'a', bankId: 'w', qty: 10, roomId: 'Bed' }, { id: 'b', bankId: 'p', qty: 20, roomId: 'Bed' }], 12000, { timestamp: 20, parentTierId: 'v1' });
const ACCEPTED: any = {
  name: 'Palacia', scopeFlow: { enabled: true }, financials: { discounts: [] },
  proposalAcceptance: { accepted: true, at: Date.UTC(2026, 9, 2), via: 'written', acceptedBy: 'Client', tierId: 'v1', tierName: 'Comfort Upgrade', amount: 10000, reference: 'D1', recordedBy: 'Priya', recordedAt: 1 },
};

describe('the version the client agreed to', () => {
  it('is the one their acceptance names, else the one sent, else the newest', () => {
    expect(agreedScopeCandidate(ACCEPTED, [V1, V2])).toEqual({ tierId: 'v1', why: 'accepted' });
    expect(agreedScopeCandidate({}, [V1, V2], 'v1')).toEqual({ tierId: 'v1', why: 'sent' });
    expect(agreedScopeCandidate({}, [V1, V2])).toEqual({ tierId: 'v2', why: 'newest' });
    expect(agreedScopeCandidate({ proposalAcceptance: { ...ACCEPTED.proposalAcceptance, tierId: 'gone' } }, [V1, V2])).toEqual({ tierId: 'v2', why: 'newest' });
    expect(agreedScopeCandidate({}, [])).toBeNull();
  });
});

function Studio({ probe }: { probe: (s: any) => void }) {
  const [ctx, setCtx] = useState<any>(ACCEPTED);
  const [tiers, setTiers] = useState<any[]>([V1, V2]);
  probe({ ctx, tiers });
  return <ScopeWorkspace tiers={tiers} approvedTierId={ctx.approvedTierId} bank={BANK} projectContext={ctx} setProjectContext={setCtx as any} setTiers={setTiers as any} currentUser="Priya" />;
}

describe('Versions & Revision Studio with no option approved', () => {
  it('offers the accepted version, an earlier one included, and makes it the agreed scope to record', () => {
    let s: any;
    render(<Studio probe={(x) => { s = x; }} />);
    expect(screen.getByText('No agreed scope yet')).toBeTruthy();
    const pick = screen.getByRole('combobox', { name: 'The version the client agreed to' }) as HTMLSelectElement;
    expect(pick.value).toBe('v1');
    expect(screen.getByText(/v1 is an earlier version/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make it the agreed scope' }));
    expect(s.ctx.approvedTierId).toBe('v1');
    expect(s.ctx.financials.approvedExecutionValue).toBe(10000);
    expect(s.tiers.find((t: any) => t.id === 'v1')).toMatchObject({ lifecycleTag: 'Current contract', approval: { by: 'Priya' } });
    expect(s.tiers.find((t: any) => t.id === 'v2').lifecycleTag).toBeUndefined();
    /* Next: record it as Detailed BOQ v1, as already agreed. */
    expect(screen.getByText(/Record Comfort Upgrade as Detailed BOQ v1/)).toBeTruthy();
  });
});

describe('Pricing & Tiers', () => {
  function Pricing({ probe }: { probe: (s: any) => void }) {
    const [tiers, setTiers] = useState<any[]>([V1, V2]);
    const [ctx, setCtx] = useState<any>({ name: 'Palacia', financials: { discounts: [] } });
    const [active, setActive] = useState<string | null>('v2');
    probe({ ctx, tiers });
    return <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive} projectContext={ctx} setProjectContext={setCtx} bank={BANK} setActiveTab={() => undefined} />;
  }

  it('approves an earlier version the client agreed to', () => {
    let s: any;
    render(<Pricing probe={(x) => { s = x; }} />);
    const card = screen.getByRole('article', { name: 'Comfort Upgrade' });
    fireEvent.click(within(card).getByRole('button', { name: /^v1 ·/ }));
    fireEvent.click(within(screen.getByRole('article', { name: 'Comfort Upgrade' })).getByRole('button', { name: 'Approve v1, the version the client agreed' }));
    expect(s.ctx.approvedTierId).toBe('v1');
    expect(s.tiers.find((t: any) => t.id === 'v2').lifecycleTag).toBeUndefined();
  });
});
