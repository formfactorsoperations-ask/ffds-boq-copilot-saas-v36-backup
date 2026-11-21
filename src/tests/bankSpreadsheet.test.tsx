/*
  The Item bank as a sheet: working in it must not fight the person typing.
  The row being renamed stays where it is, a number can be emptied and typed
  again, and Enter moves down the column.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));

import BankSpreadsheetTable from '../../components/bank/BankSpreadsheetTable';

const seed: any[] = [
  { id: 'a', name: 'Bed', cat: 'Carpentry', unit: 'nos', specs: '', materials: 650, labor: 350, margin: 20 },
  { id: 'b', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: 'Ply', materials: 1300, labor: 700, margin: 10 },
];
const projects: any[] = [{ id: 'p1', tiers: [{ boq: [{ bankId: 'b' }] }] }];

const Sheet: React.FC<{ onUsage?: (i: any) => void }> = ({ onUsage }) => {
  const [items, setItems] = useState(seed);
  return (
    <BankSpreadsheetTable
      items={items}
      selectedItemIds={new Set()}
      onToggleSelectItem={vi.fn()}
      onToggleSelectAll={vi.fn()}
      isAllSelected={false}
      onUpdateItem={(id, next) => setItems((prev) => prev.map((i) => (i.id === id ? next : i)))}
      onDeleteItem={vi.fn()}
      onDuplicateItem={vi.fn()}
      aiStrategy={'balanced' as any}
      categories={['All', 'Carpentry']}
      highlightedBankItemId={null}
      projects={projects}
      onViewProjectUsage={onUsage}
    />
  );
};

const names = () => (screen.getAllByLabelText('Item name') as HTMLInputElement[]).map((i) => i.value);

describe('the Item bank sheet', () => {
  it('keeps a row where it is while it is renamed, and sorts again when asked', () => {
    render(<Sheet />);
    expect(names()).toEqual(['Bed', 'Wardrobe']);
    fireEvent.change(screen.getAllByLabelText('Item name')[0], { target: { value: 'Zebra bed' } });
    expect(names()).toEqual(['Zebra bed', 'Wardrobe']);
    // Descending, then ascending again: now the new name takes its place.
    fireEvent.click(screen.getByRole('button', { name: 'Item and specification' }));
    fireEvent.click(screen.getByRole('button', { name: 'Item and specification' }));
    expect(names()).toEqual(['Wardrobe', 'Zebra bed']);
  });

  it('lets a number be emptied and typed again, and works the sell price from it', () => {
    render(<Sheet />);
    const margin = screen.getAllByLabelText('Margin percent')[0] as HTMLInputElement;
    fireEvent.focus(margin);
    fireEvent.change(margin, { target: { value: '' } });
    expect(margin.value).toBe('');
    fireEvent.change(margin, { target: { value: '30' } });
    expect((screen.getAllByLabelText('Sell price')[0] as HTMLInputElement).value).toBe('1300');
  });

  it('splits a typed total 65% material, 35% labour, and turns a typed price into a margin', () => {
    render(<Sheet />);
    fireEvent.change(screen.getAllByLabelText('Total cost')[0], { target: { value: '2000' } });
    expect((screen.getAllByLabelText('Material cost')[0] as HTMLInputElement).value).toBe('1300');
    expect((screen.getAllByLabelText('Labour cost')[0] as HTMLInputElement).value).toBe('700');
    fireEvent.change(screen.getAllByLabelText('Sell price')[0], { target: { value: '2500' } });
    expect((screen.getAllByLabelText('Margin percent')[0] as HTMLInputElement).value).toBe('25');
  });

  it('moves down the column on Enter and back up on Shift+Enter', () => {
    render(<Sheet />);
    const cells = screen.getAllByLabelText('Material cost');
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: 'Enter' });
    expect(document.activeElement).toBe(cells[1]);
    fireEvent.keyDown(cells[1], { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(cells[0]);
  });

  it('counts the projects that use an item, and opens the list', () => {
    const onUsage = vi.fn();
    render(<Sheet onUsage={onUsage} />);
    fireEvent.click(screen.getByTitle('Used in 1 project. Open the list.'));
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });
});
