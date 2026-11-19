import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const role = { current: 'Owner' };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'studio_a', playground: true }, currentRole: role.current, currentRoles: [role.current], currentUserAuth: { displayName: 'Anish K.' } }),
}));
const saved: any[] = [];
vi.mock('../../services/materialSpecsService', () => ({
  watchMaterialSpecs: (_t: string, onBank: (b: any) => void) => { onBank(null); return () => {}; },
  saveMaterialSpecs: vi.fn(async (_t: string, bank: any, before: any) => { saved.push({ bank, before }); }),
}));

import MaterialSpecsTab from '../../components/materialSpecs/MaterialSpecsTab';
import { versionsAppendOnly, seedFromPackages, currentVersion } from '../../lib/materialSpecs';

afterEach(cleanup);
beforeEach(() => { saved.length = 0; });

describe('the Material specs tab', () => {
  it('lets the Owner save hardware as v2', async () => {
    role.current = 'Owner';
    render(<MaterialSpecsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Hardware System/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as v2' }));
    fireEvent.change(screen.getByLabelText('What the client reads'), { target: { value: 'SS soft-close hinges and telescopic channels' } });
    fireEvent.change(screen.getByLabelText('Why a new version'), { target: { value: 'Telescopic channels named' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save as v2' }).pop()!);
    await waitFor(() => expect(saved.length).toBe(1));
    const { bank, before } = saved[0];
    expect(before).toBeNull();
    expect(versionsAppendOnly(seedFromPackages(), bank)).toBe(true);
    expect(currentVersion(bank, 'hardware-system-1')).toMatchObject({ v: 2, words: 'SS soft-close hinges and telescopic channels', by: 'Anish K.' });
    expect(await screen.findByText(/saved as v2/)).toBeTruthy();
  });

  it('shows everyone else the bank read-only', () => {
    role.current = 'Designer';
    render(<MaterialSpecsTab />);
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save as v/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a material' })).toBeNull();
    // The history is still open to read.
    fireEvent.click(screen.getAllByRole('button', { name: /1 version/ })[0]);
    expect(screen.getByRole('list', { name: /versions/ })).toBeTruthy();
  });

  it('refuses an unexplained version without saving', () => {
    role.current = 'Owner';
    render(<MaterialSpecsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Hardware System/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as v2' }));
    fireEvent.change(screen.getByLabelText('What the client reads'), { target: { value: 'Something new' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save as v2' }).pop()!);
    expect(screen.getByText(/Say why there is a new version/)).toBeTruthy();
    expect(saved.length).toBe(0);
  });
});
