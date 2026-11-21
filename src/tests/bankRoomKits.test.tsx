/*
  Item bank → Room kits, and the window that changes ticked items together.
  A kit's items can be taken out and added, a kit is made in a window, and the
  bulk window opens on the action that was asked for.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import BankRoomKits from '../../components/bank/BankRoomKits';
import BankBulkActionModal from '../../components/bank/BankBulkActionModal';

const bank: any[] = [
  { id: 'a', name: 'Bed', cat: 'Carpentry', unit: 'nos', materials: 650, labor: 350, margin: 20 },
  { id: 'b', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', materials: 1300, labor: 700, margin: 10 },
  { id: 'c', name: 'False ceiling', cat: 'Civil', unit: 'sq ft', materials: 60, labor: 40, margin: 25 },
];

const Kits: React.FC<{ saved: (k: any[]) => void }> = ({ saved }) => {
  const [kits, setKits] = useState<any[]>([{ id: 'k1', name: 'Master bedroom', description: '', itemIds: ['a', 'b'] }]);
  return <BankRoomKits bank={bank} kits={kits} onSave={async (next) => { saved(next); setKits(next); }} />;
};

describe('Room kits', () => {
  it('takes an item out of a kit and puts another in', async () => {
    const saved = vi.fn();
    render(<Kits saved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take Bed out of Master bedroom' }));
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'k1', itemIds: ['b'] })]));

    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }));
    fireEvent.change(screen.getByLabelText('Find an item to add to Master bedroom'), { target: { value: 'ceil' } });
    fireEvent.click(screen.getByRole('button', { name: /False ceiling/ }));
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith([expect.objectContaining({ itemIds: ['b', 'c'] })]));
  });

  it('asks before deleting a kit', async () => {
    const saved = vi.fn();
    render(<Kits saved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Master bedroom' }));
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete kit' }));
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith([]));
  });

  it('makes a kit in a window, once it has a name and an item', async () => {
    const saved = vi.fn();
    render(<Kits saved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create kit' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a room kit' });
    const create = within(dialog).getByRole('button', { name: 'Create kit' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Master bedroom'), { target: { value: 'Guest room' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /False ceiling/ }));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'k1' }),
      expect.objectContaining({ name: 'Guest room', itemIds: ['c'] }),
    ]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('changing ticked items together', () => {
  const props = { isOpen: true, onClose: vi.fn(), selectedItems: bank.slice(0, 2), allCategories: ['All', 'Carpentry', 'Civil'] };

  it('opens on the action that was asked for', () => {
    render(<BankBulkActionModal {...props} onApplyBulkUpdate={vi.fn()} initialTab="uom" />);
    expect(screen.getByRole('tab', { name: 'Unit' }).getAttribute('aria-selected')).toBe('true');
  });

  it('applies a rate rise to every ticked item and leaves margins alone', () => {
    const apply = vi.fn();
    render(<BankBulkActionModal {...props} onApplyBulkUpdate={apply} initialTab="cost" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 items' }));
    expect(apply).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', materials: 715, labor: 385, margin: 20 }),
      expect.objectContaining({ id: 'b', materials: 1430, labor: 770, margin: 10 }),
    ]);
  });

  it('will not save a room kit without a name', () => {
    const create = vi.fn();
    render(<BankBulkActionModal {...props} onApplyBulkUpdate={vi.fn()} onCreateCustomBundle={create} initialTab="bundle" />);
    const save = screen.getByRole('button', { name: 'Save room kit' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g. Master bedroom'), { target: { value: 'Bedroom set' } });
    fireEvent.click(save);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bedroom set', itemIds: ['a', 'b'] }));
  });
});
