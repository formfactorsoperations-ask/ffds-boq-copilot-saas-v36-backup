/*
  Item Bank → Export usage: one click downloads which project lines use each
  item and at what price. It reads the bank and the projects and writes to neither.
*/
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { orgName: 'Form Factors', tenantId: 't1' } }) }));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: { customBundles: [] }, updateSettings: vi.fn() }) }));

import BankTab from '../../components/BankTab';
import { BANK_USAGE_KIND } from '../../lib/bankUsageExport';

const bank: any[] = [
  { id: 'gen-015', name: 'KING SIZE BED WITH STORAGE', cat: 'Carpentry', unit: 'sq ft', specs: 'Bed', materials: 1260, labor: 540, margin: 15 },
  { id: 'ADHOC_a1', name: 'KING SIZE BED WITH STORAGE', cat: 'Carpentry', unit: 'SQFT.', specs: '', materials: 1596, labor: 684, margin: 0 },
];
const projects: any[] = [{
  id: 'p1', lastModified: 1, context: { name: 'Tower B 1204', clientName: 'Asha Menon', status: 'closed' },
  tiers: [{ id: 't1', name: 'Premium', boq: [{ id: 'l1', bankId: 'ADHOC_a1', qty: 30 }] }],
}];

afterEach(() => vi.restoreAllMocks());

describe('Item Bank: Lock prices', () => {
  const props = { bank, setBank: vi.fn(), aiStrategy: 'balanced' as any, highlightedBankItemId: null, onHighlightClear: vi.fn(), projects };

  it('is not drawn unless the owner is given it', () => {
    render(<BankTab {...props} />);
    expect(screen.queryByRole('button', { name: 'Lock prices' })).toBeNull();
  });

  it('opens the window, which reads the projects and saves nothing', async () => {
    const read = vi.fn(async () => JSON.parse(JSON.stringify(projects)));
    const save = vi.fn(async () => {});
    render(<BankTab {...props} priceLock={{ read, save }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock prices' }));
    expect(await screen.findByText('Lock prices on projects')).toBeTruthy();
    expect(await screen.findByText('Totals unchanged')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Item Bank: Export usage', () => {
  it('downloads the usage file and leaves the bank alone', async () => {
    let blob: Blob | null = null;
    (URL as any).createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; });
    (URL as any).revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const setBank = vi.fn();

    render(<BankTab bank={bank} setBank={setBank} aiStrategy={'balanced' as any} highlightedBankItemId={null} onHighlightClear={vi.fn()} projects={projects} />);
    const button = screen.getByRole('button', { name: 'Export usage' });
    expect(button.getAttribute('title')).toContain('across 1 project.');
    fireEvent.click(button);

    expect(click).toHaveBeenCalledTimes(1);
    expect(setBank).not.toHaveBeenCalled();
    const data = JSON.parse(await blob!.text());
    expect(data.kind).toBe(BANK_USAGE_KIND);
    expect(data.studio).toBe('Form Factors');
    expect(data.bank).toHaveLength(2);
    expect(data.projects[0].tiers[0].lines[0]).toMatchObject({ bankId: 'ADHOC_a1', source: 'bank', qty: 30, rate: 2280 });
    expect(JSON.stringify(data)).not.toContain('Asha Menon');
  });
});
