/*
  BOQ Playground PR X: an Item Bank card says how its item is supplied, with a
  chip, and sets it: by the studio, bought by the client, or at actuals.
*/
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));

import BankItemCard from '../../components/BankItemCard';

const item: any = { id: 'b58', name: 'Hob and chimney', cat: 'Appliances', unit: 'nos', specs: 'Chosen and bought by you.', materials: 38000, labor: 0, margin: 0 };

describe('an Item Bank card says how its item is supplied', () => {
  it('no chip for the studio’s own; a chip once set, and the setting writes the item', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<BankItemCard item={item} onUpdate={onUpdate} onDelete={vi.fn()} aiStrategy={'balanced' as any} />);
    expect(screen.queryByText('Bought by client', { selector: 'span' })).toBeNull();
    const sel = screen.getByLabelText('Supplied') as HTMLSelectElement;
    expect(sel.value).toBe('');
    fireEvent.change(sel, { target: { value: 'client' } });
    expect(onUpdate).toHaveBeenCalledWith('b58', expect.objectContaining({ supply: 'client' }));
    rerender(<BankItemCard item={{ ...item, supply: 'client' }} onUpdate={onUpdate} onDelete={vi.fn()} aiStrategy={'balanced' as any} />);
    expect(screen.getAllByText('Bought by client').length).toBe(2);
    fireEvent.change(screen.getByLabelText('Supplied'), { target: { value: '' } });
    // Back to the studio: stored as null, which Firestore keeps (it refuses undefined).
    expect(onUpdate).toHaveBeenLastCalledWith('b58', expect.objectContaining({ supply: null }));
    rerender(<BankItemCard item={{ ...item, supply: 'actuals' }} onUpdate={onUpdate} onDelete={vi.fn()} aiStrategy={'balanced' as any} />);
    expect(screen.getAllByText('At actuals').length).toBe(2);
  });
});
