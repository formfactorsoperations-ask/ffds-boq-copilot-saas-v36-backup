/*
  Item Bank → Lock prices. The window shows what locking would write and that no
  total moves; on the button it reads the projects again, downloads the lock
  file, saves, and reads back what was stored before saying a project is locked.
*/
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PriceLockModal from '../../components/bank/PriceLockModal';
import { PRICE_LOCK_KIND } from '../../lib/priceLock';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';

const bank: any[] = [
  { id: 'gen-014', name: 'WARDOBE WITH LOFT', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1295, labor: 555, margin: 15 },
  { id: 'gen-015', name: 'KING SIZE BED WITH STORAGE', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15 },
];
const seed = (): any[] => [
  { id: 'p1', lastModified: 1, context: { name: 'Harmony 704 Thane 2BHK', clientName: 'Asha Menon', status: 'completed' }, tiers: [{ id: 't1', name: 'Comfort Upgrade', boq: [{ id: 'l1', bankId: 'gen-014', qty: 45, marginOverride: 15 }, { id: 'l2', bankId: 'gen-015', qty: 36 }] }] },
  { id: 'p2', lastModified: 2, context: { name: 'Runwal Eirene - 2BHK', status: 'completed' }, tiers: [{ id: 't2', name: 'Essential Elegance', boq: [{ id: 'm1', bankId: 'gen-014', qty: 40 }] }] },
  { id: 'p3', lastModified: 3, context: { name: 'Unique Vistas', status: 'won' }, tiers: [{ id: 't3', name: 'Detailed BOQ v2', boq: [{ id: 'n1', bankId: 'gen-014', qty: 10, baseRate: 1295, labor: 555, marginOverride: 15 }] }] },
  { id: 'p4', lastModified: 4, context: { name: 'Lake Pleasant Powai', status: 'completed' }, tiers: [{ id: 't4', name: 'Client-BOQ', boq: [{ id: 'o1', bankId: 'gen-015', qty: 8 }] }, { id: 't5', name: 'Older option', boq: [], boqTrimmed: true }] },
];
const total = (p: any) => boqTotal(p.tiers[0].boq, buildBankMap(bank, []));

let store: any[];
let order: string[];
let blobs: Blob[];
const copy = (x: any) => JSON.parse(JSON.stringify(x));
const read = vi.fn(async () => { order.push('read'); return copy(store); });
const save = vi.fn(async (p: any) => { order.push(`save:${p.id}`); store = store.map((x) => (x.id === p.id ? copy(p) : x)); });

beforeEach(() => {
  store = seed(); order = []; blobs = [];
  read.mockClear(); save.mockClear();
  (URL as any).createObjectURL = vi.fn((b: Blob) => { blobs.push(b); order.push('download'); return 'blob:x'; });
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

const open = async (over: any = {}) => {
  render(<PriceLockModal bank={bank} studio="Form Factors" read={read} save={save} onClose={vi.fn()} {...over} />);
  await screen.findByText('Harmony 704 Thane 2BHK');
};
const row = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement;

describe('Lock prices', () => {
  it('lists the projects that borrow prices, ticks none, and saves nothing on opening', async () => {
    await open();
    expect(screen.getByText('Runwal Eirene - 2BHK')).toBeTruthy();
    // Already holds its prices, and one whose older option is not loaded: neither is offered.
    expect(screen.queryByText('Unique Vistas')).toBeNull();
    expect(screen.queryByText('Lake Pleasant Powai')).toBeNull();
    expect(screen.getAllByText('Totals unchanged')).toHaveLength(2);
    expect((screen.getByRole('button', { name: /Lock prices on 0 projects/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('shows each option\'s total before and after once a project is ticked', async () => {
    await open();
    fireEvent.click(row('Harmony 704 Thane 2BHK'));
    expect(screen.getByText('2 of 2 lines')).toBeTruthy();
    expect(screen.getByText(/1,70,258 before and after/)).toBeTruthy();
  });

  it('cannot tick a project that is not whole', async () => {
    await open();
    fireEvent.click(screen.getByRole('radio', { name: /All projects/ }));
    expect(row('Lake Pleasant Powai').disabled).toBe(true);
    expect(screen.getByText('Left alone')).toBeTruthy();
    expect(row('Unique Vistas').disabled).toBe(true);
    expect(screen.getByText('Nothing to lock')).toBeTruthy();
  });

  it('downloads the lock file, then saves, then checks what was stored', async () => {
    await open();
    const before = total(store[0]);
    fireEvent.click(row('Harmony 704 Thane 2BHK'));
    order = [];
    fireEvent.click(screen.getByRole('button', { name: 'Lock prices on 1 project' }));
    await screen.findByText('Locked');
    expect(order).toEqual(['read', 'download', 'save:p1', 'read']);
    expect(read).toHaveBeenLastCalledWith(true);

    // Only the ticked project was written, with the borrowed figures and the same total.
    expect(save).toHaveBeenCalledTimes(1);
    expect(store[0].tiers[0].boq[0]).toMatchObject({ baseRate: 1295, labor: 555, marginOverride: 15 });
    expect(store[0].tiers[0].boq[1]).toMatchObject({ baseRate: 1260, labor: 540, marginOverride: 15 });
    expect(total(store[0])).toBe(before);
    expect(store[1]).toEqual(seed()[1]);
    expect(screen.getByText(/Locked on 2 lines\. Every total is the same as before\./)).toBeTruthy();

    // The file holds the lines as they were, and no client details.
    const file = JSON.parse(await blobs[0].text());
    expect(file.kind).toBe(PRICE_LOCK_KIND);
    expect(file.projects[0].before[0].boq).toEqual(seed()[0].tiers[0].boq);
    expect(JSON.stringify(file)).not.toContain('Asha Menon');
  });

  it('does not say Locked when the save did not land', async () => {
    await open({ save: vi.fn(async () => {}) });
    fireEvent.click(row('Runwal Eirene - 2BHK'));
    fireEvent.click(screen.getByRole('button', { name: 'Lock prices on 1 project' }));
    await screen.findByText('Not confirmed');
    expect(screen.queryByText('Locked')).toBeNull();
  });

  it('leaves a project alone when someone else changed it in the meantime', async () => {
    await open();
    fireEvent.click(row('Runwal Eirene - 2BHK'));
    // Locked elsewhere after this window listed it.
    store = store.map((p) => (p.id === 'p2' ? { ...p, tiers: [{ ...p.tiers[0], boq: [{ id: 'm1', bankId: 'gen-014', qty: 40, baseRate: 1295, labor: 555, marginOverride: 15 }] }] } : p));
    fireEvent.click(screen.getByRole('button', { name: 'Lock prices on 1 project' }));
    await screen.findByText('Left as it is');
    expect(screen.getByText('There was nothing to change.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(0);
  });

  it('takes a lock back off from its file', async () => {
    await open();
    const original = copy(store[0]);
    fireEvent.click(row('Harmony 704 Thane 2BHK'));
    fireEvent.click(screen.getByRole('button', { name: 'Lock prices on 1 project' }));
    await screen.findByText('Locked');
    const text = await blobs[0].text();

    fireEvent.click(screen.getByRole('button', { name: 'Check the projects again' }));
    await screen.findByText('Runwal Eirene - 2BHK');
    expect(screen.queryByText('Harmony 704 Thane 2BHK')).toBeNull();   // nothing left to lock on it

    const input = screen.getByLabelText('Lock file') as HTMLInputElement;
    const lockFile = new File([text], 'lock.json', { type: 'application/json' });
    (lockFile as any).text = async () => text;
    fireEvent.change(input, { target: { files: [lockFile] } });
    await screen.findByText('Remove a price lock');
    await screen.findByText('Harmony 704 Thane 2BHK');
    fireEvent.click(row('Harmony 704 Thane 2BHK'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove the lock on 1 project' }));
    await screen.findByText(/Lock removed on 2 lines/);
    expect(store[0].tiers).toEqual(original.tiers);
    expect(total(store[0])).toBe(total(original));
  });

  it('says so when a file is not a lock file', async () => {
    await open();
    const bad = new File(['{}'], 'bank.json', { type: 'application/json' });
    (bad as any).text = async () => '{}';
    fireEvent.change(screen.getByLabelText('Lock file'), { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/That is not a lock file/)).toBeTruthy());
  });
});
