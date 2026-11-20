/*
  Options wait for the client's floor plan (owner, 20 Nov 2026): Pricing & Tiers
  makes no option, and the setup wizard goes no further, until the plan is on
  the project. A design-only project makes no BOQ options and is not held.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
import { optionsWaitForPlan } from '../../lib/briefRead';

afterEach(cleanup);

const option = (id: string, name: string): any => ({
  id, name, timestamp: 1, boq: [],
  summary: { totalSell: 0, designFee: 0, totalRevenue: 0, totalCost: 0, totalGm: 0, itemCount: 0, blendedGm: 0 },
});

function Tiers({ ctx0, probe, go }: { ctx0: any; probe?: (t: any[]) => void; go?: (tab: string) => void }) {
  const [tiers, setTiers] = useState<any[]>([option('a', 'Comfort Upgrade')]);
  const [ctx, setCtx] = useState<any>(ctx0);
  const [active, setActive] = useState<string | null>('a');
  probe?.(tiers);
  return <TierManager tiers={tiers} setTiers={setTiers as any} activeTierId={active} setActiveTierId={setActive}
    projectContext={ctx} setProjectContext={setCtx} bank={[]} setActiveTab={go || (() => undefined)} />;
}

describe('options wait for the floor plan', () => {
  it('holds a turnkey project with no plan, and not a design-only one or one with its plan', () => {
    expect(optionsWaitForPlan({ name: 'Flat' }, false)).toBe(true);
    expect(optionsWaitForPlan({ name: 'Flat' }, true)).toBe(false);
    expect(optionsWaitForPlan({ floorplanImageUrl: 'https://x/o/plan.jpg' } as any, false)).toBe(false);
    expect(optionsWaitForPlan({ planSheet: { source: 'upload', imageUrl: 'https://x/o/p.pdf' } } as any, false)).toBe(false);
  });

  it('Pricing & Tiers: Add option and Regenerate wait, and say where to upload the plan', () => {
    let tiers: any[] = [];
    const go = vi.fn();
    render(<Tiers ctx0={{ name: 'Flat', area: 465 }} probe={t => { tiers = t; }} go={go} />);
    const add = screen.getByRole('button', { name: /Add option/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Regenerate/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(tiers).toHaveLength(1);
    expect(screen.getByText(/Upload the client’s floor plan first/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upload it in Brief & Site' }));
    expect(go).toHaveBeenCalledWith('leadiq');
  });

  it('with the plan on the project, Add option makes a Playground option', () => {
    let tiers: any[] = [];
    render(<Tiers ctx0={{ name: 'Flat', area: 465, floorplanImageUrl: 'https://x/o/plan.jpg' }} probe={t => { tiers = t; }} />);
    expect(screen.queryByText(/Upload the client’s floor plan first/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Add option/ }));
    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({ boqFormat: 'playground' });
  });
});
