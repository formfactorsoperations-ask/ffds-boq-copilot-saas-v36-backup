/*
  The Vendor directory: figures that filter, cards and a table, a vendor's
  drawer, and the windows that add, message and delete.
*/
import React from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const store: { list: any[] } = { list: [] };
vi.mock('../../services/dbService', () => ({
  db: { getVendors: async () => store.list, saveVendors: async (v: any[]) => { store.list = v; } },
}));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { orgName: 'Studio Nine', tenantId: 't1' } }) }));

import VendorsManager from '../../components/VendorsManager';

const vendors = () => [
  { id: 'v1', name: 'Estillo Surfaces', supplies: ['material'], categories: ['Marble, Granite & Stone'], phone: '+91 98201 44520', email: 'orders@estillo.com', gstin: '27AAACE1234F1Z8', paymentTerms: '50% Advance, 50% on Delivery', defaultLeadDays: 8, notes: 'Ask for Rajesh.', active: true, createdAt: 2 },
  { id: 'v2', name: 'Royal Woodcrafters', supplies: ['labour', 'material'], categories: ['Carpentry & Woodwork'], phone: '', email: '', defaultLeadDays: 12, active: true, createdAt: 1 },
  { id: 'v3', name: 'Kiran Timbers', supplies: ['material'], categories: [], active: false, createdAt: 3 },
];
const projects: any[] = [
  { id: 'p1', context: { name: 'Palacia 3BHK', materialSelections: [
    { vendor: 'estillo surfaces ', itemName: 'Botticino slab', quotedPrice: 185000 }, { vendor: 'Estillo Surfaces', itemName: 'Quartz counter' },
    { vendor: 'Estillo Surfaces', itemName: 'Skirting' }, { vendor: 'Estillo Surfaces', itemName: 'Threshold' },
  ] } },
];

beforeEach(() => { store.list = vendors(); });
afterEach(cleanup);

const open = async () => {
  const stats = vi.fn();
  render(<VendorsManager projects={projects} onStats={stats} />);
  await screen.findByRole('article', { name: 'Estillo Surfaces' });
  return stats;
};

describe('the Vendor directory', () => {
  it('shows each vendor in full and reports the directory upward', async () => {
    const stats = await open();
    const card = screen.getByRole('article', { name: 'Estillo Surfaces' });
    expect(within(card).getByText('+91 98201 44520')).toBeTruthy();
    expect(within(card).getByText('8 days')).toBeTruthy();
    expect(within(card).getByText('1 project')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Kiran Timbers' })).getByText('Inactive')).toBeTruthy();
    // onStats fires from an effect after the cards commit, so the card can be on screen
    // while the last call still carries the empty list reported on mount.
    await waitFor(() => expect(stats).toHaveBeenLastCalledWith({ total: 3, active: 2, reachable: 1 }));
    // A vendor with no phone cannot be messaged, and the button says why.
    const noPhone = within(screen.getByRole('article', { name: 'Royal Woodcrafters' })).getByRole('button', { name: 'Message' }) as HTMLButtonElement;
    expect(noPhone.disabled).toBe(true);
  });

  it('averages lead time over the vendors that have one', async () => {
    await open();
    // (8 + 12) / 2: the vendor with no lead time is not counted as zero days.
    await waitFor(() => expect(screen.getByText('10 days')).toBeTruthy());
    expect(screen.getByText('Across 2 with a lead time')).toBeTruthy();
  });

  it('filters from a figure, and clears', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /^Labour.*Trade contractors$/ }));
    expect(screen.queryByRole('article', { name: 'Estillo Surfaces' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Royal Woodcrafters' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('1 of 3 vendors');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('article').length).toBe(3);
  });

  it('opens a vendor: its details, and every selection that names it', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('article', { name: 'Estillo Surfaces' })).getByTitle('Open this vendor'));
    const drawer = screen.getByRole('dialog', { name: 'Estillo Surfaces' });
    expect(within(drawer).getByText('27AAACE1234F1Z8')).toBeTruthy();
    expect(within(drawer).getByText('Ask for Rajesh.')).toBeTruthy();
    // All four, where only the first three used to be listed.
    for (const item of ['Botticino slab', 'Quartz counter', 'Skirting', 'Threshold']) expect(within(drawer).getByText(item)).toBeTruthy();
    expect(within(drawer).getByText('₹1,85,000')).toBeTruthy();
  });

  it('writes a message in the studio’s own name', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('article', { name: 'Estillo Surfaces' })).getByRole('button', { name: 'Message' }));
    const text = (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value;
    expect(text).toContain('Hi Estillo Surfaces, this is Studio Nine.');
    expect(text).not.toContain('Form Factors');
  });

  it('adds a vendor, and asks before deleting one', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add vendor' }));
    const form = screen.getByRole('dialog', { name: 'Add a vendor' });
    const save = within(form).getByRole('button', { name: 'Add vendor' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(form).getByPlaceholderText('e.g. Royal Woodcrafters'), { target: { value: 'Apex Modular' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Turnkey' }));
    fireEvent.submit(form.querySelector('form')!);
    await screen.findByRole('article', { name: 'Apex Modular' });
    expect(store.list[0]).toMatchObject({ name: 'Apex Modular', supplies: ['material', 'turnkey'], active: true });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Kiran Timbers' }));
    expect(store.list.length).toBe(4);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete a vendor' })).getByRole('button', { name: 'Delete vendor' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Kiran Timbers' })).toBeNull());
    expect(store.list.map(v => v.id)).not.toContain('v3');
  });
});
