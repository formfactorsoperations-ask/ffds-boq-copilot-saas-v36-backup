/*
  The Item bank as a sheet shows each made item's standard size where the room
  factor was, and opens it. A surface or a service keeps its factor: it is
  measured, not given a size. With 320 items to set, the sheet is where the
  owner sees at a glance which have one.
*/
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));

import BankSpreadsheetTable from '../../components/bank/BankSpreadsheetTable';

const items: any[] = [
  { id: 'w', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1300, labor: 700, margin: 10 },
  { id: 'h', name: 'Headboard', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 600, labor: 400, margin: 15 },
  { id: 'p', name: 'Interior painting', cat: 'Painting', unit: 'sq ft', specs: '', materials: 20, labor: 10, margin: 20 },
  { id: 'b', name: 'Queen bed', cat: 'Loose Furniture', unit: 'nos', specs: '', materials: 30000, labor: 0, margin: 20 },
];
const sheet = (onOpenSize?: (id: string) => void) => render(
  <BankSpreadsheetTable items={items} selectedItemIds={new Set()} onToggleSelectItem={vi.fn()} onToggleSelectAll={vi.fn()} isAllSelected={false}
    onUpdateItem={vi.fn()} onDeleteItem={vi.fn()} onDuplicateItem={vi.fn()} aiStrategy={'balanced' as any} categories={['All']} highlightedBankItemId={null}
    onOpenSize={onOpenSize} />,
);

describe('the standard size in the Item bank sheet', () => {
  it('shows a made item’s size and opens it', () => {
    const open = vi.fn();
    sheet(open);
    fireEvent.click(screen.getByRole('button', { name: 'Standard size of Wardrobe: 6′ × 7′' }));
    expect(open).toHaveBeenCalledWith('w');
  });

  it('asks for a size on a made item that has none', () => {
    const open = vi.fn();
    sheet(open);
    fireEvent.click(screen.getByRole('button', { name: 'Set the standard size of Headboard' }));
    expect(open).toHaveBeenCalledWith('h');
  });

  it('keeps the room factor for what is measured or counted', () => {
    sheet(vi.fn());
    // Two rows have no size to show: painting and the bed keep the factor field.
    expect(screen.getAllByLabelText(/Area factor/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /size of Interior painting/i })).toBeNull();
  });
});
