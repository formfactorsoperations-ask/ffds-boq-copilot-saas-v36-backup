/*
  BOQ → Import Excel matches each row to the Item Bank before anything is made.

  It used to need the name letter for letter, and made a new bank item for every
  row it did not find, room by room: the same wardrobe in two rooms became two
  items. 43 of the bank's repeated items came in this way.
*/
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelImportModal from '../../components/ExcelImportModal';
import { resolveBoqLine, buildBankMap } from '../../lib/boqPricing';
import { addToBank, pickable } from '../../lib/bankMatch';

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: 'Bank spec', materials: 1260, labor: 540, margin: 15, ...over,
});
const bank = [
  item('gen-015', 'KING SIZE BED WITH STORAGE'),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0, mergedInto: 'gen-015' }),
  item('gen-014', 'WARDOBE WITH LOFT', { materials: 1295, labor: 555 }),
  item('gen-050', 'KITCHEN SLIDING DOOR'),
  item('ADHOC_p1', 'PANELING AROUND HEADBOARD', { materials: [1440], labor: [], margin: 0 }),
];

const sheet = [
  ['Item', 'Room', 'Qty', 'Unit', 'Rate'],
  ['King Size Bed with Storage ', 'Master Bedroom', 40, 'SQFT.', 2280],
  ['WARDOBE WITH LOFT', 'Master Bedroom', 60, 'sqft', 2400],
  ['WARDOBE WITH LOFT', 'Kids Bedroom', 45, 'sqft', 2500],
  ['Kitchen Sliding Door (PVC)', 'Kitchen', 28, 'sq ft', 1056],
  ['Pooja Unit', 'Living Room', 12, 'sqft', 2160],
  ['POOJA UNIT', 'Kids Bedroom', 6, 'sqft', 2000],
  ['Paneling around headboard', 'Master Bedroom', 20, 'sqft', 1440],
];

async function toReview(onImport = vi.fn()) {
  const ws = XLSX.utils.aoa_to_sheet(sheet);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const { container } = render(<ExcelImportModal isOpen onClose={vi.fn()} onImport={onImport} bank={bank} projectId="p1" />);
  const file = new File([buf], 'boq.xlsx');
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(await screen.findByRole('button', { name: /Verify Data/ }, { timeout: 4000 }));
  await screen.findByText('Review Data');
  return onImport;
}
const choiceOf = (name: string) => screen.getByLabelText(`Item Bank item for ${name}`) as HTMLSelectElement;

describe('Import Excel: each row finds its Item Bank item', () => {
  it('matches by how the name reads, offers the nearest, and says what is new', async () => {
    await toReview();
    // A trailing space and other capitals: still the bank's own item, not its hidden copy.
    expect(choiceOf('King Size Bed with Storage').value).toBe('gen-015');
    expect(choiceOf('King Size Bed with Storage').textContent).not.toContain('1,596');
    expect(choiceOf('Paneling around headboard').value).toBe('ADHOC_p1');
    // "(PVC)" is not in the bank: the nearest item is offered and flagged.
    expect(choiceOf('Kitchen Sliding Door (PVC)').value).toBe('gen-050');
    expect(screen.getByText('1 Closest match: check')).toBeTruthy();
    expect(choiceOf('Pooja Unit').value).toBe('new');
    // Two rows of one new thing are one new item.
    expect(screen.getByText('1 New Item')).toBeTruthy();
    expect(screen.getByText('4 Matched in Bank')).toBeTruthy();
  });

  it('imports at the sheet\'s rates, with one new item, and the price held on every line', async () => {
    const onImport = await toReview();
    fireEvent.click(screen.getByRole('button', { name: /Import 7 Items/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [tier, newItems] = onImport.mock.calls[0];

    expect(newItems.map((i: any) => i.name)).toEqual(['Pooja Unit']);
    const after = addToBank(bank, newItems, 'start');
    expect(pickable(after)).toHaveLength(pickable(bank).length + 1);

    const map = buildBankMap(after, []);
    const lines = tier.boq.map((b: any) => ({ b, r: resolveBoqLine(b, map) }));
    // Every line sells at the sheet's rate.
    expect(lines.map((l: any) => Math.round(l.r.rate))).toEqual([2280, 2400, 2500, 1056, 2160, 2000, 1440]);
    // And holds its whole price: nothing follows the bank.
    lines.forEach(({ b }: any) => {
      expect(typeof b.baseRate).toBe('number');
      expect(typeof b.labor).toBe('number');
      expect(typeof b.marginOverride).toBe('number');
    });
    // Both wardrobes, and both pooja units, are one item each.
    expect(tier.boq[1].bankId).toBe('gen-014');
    expect(tier.boq[2].bankId).toBe('gen-014');
    expect(tier.boq[4].bankId).toBe(tier.boq[5].bankId);
    expect(tier.boq[0].bankId).toBe('gen-015');
    // The bank's own rate is untouched by any of it.
    expect(after.find((i: any) => i.id === 'gen-014')).toMatchObject({ materials: 1295, labor: 555, margin: 15 });
    expect(Math.round(tier.summary.totalSell)).toBe(2280 * 40 + 2400 * 60 + 2500 * 45 + 1056 * 28 + 2160 * 12 + 2000 * 6 + 1440 * 20);

    // A bank edit afterwards moves none of them.
    const dearer = new Map(map);
    dearer.set('gen-014', { ...after.find((i: any) => i.id === 'gen-014'), labor: 900, margin: 40 });
    expect(Math.round(resolveBoqLine(tier.boq[1], dearer).rate)).toBe(2400);
  });

  it('makes a new item when the nearest match is turned down', async () => {
    const onImport = await toReview();
    fireEvent.change(choiceOf('Kitchen Sliding Door (PVC)'), { target: { value: 'new' } });
    expect(screen.queryByText(/Closest match: check/)).toBeNull();
    expect(screen.getByText('2 New Items')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Import 7 Items/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const [tier, newItems] = onImport.mock.calls[0];
    expect(newItems.map((i: any) => i.name)).toEqual(['Kitchen Sliding Door (PVC)', 'Pooja Unit']);
    expect(tier.boq[3].bankId).toBe(newItems[0].id);
  });
});
