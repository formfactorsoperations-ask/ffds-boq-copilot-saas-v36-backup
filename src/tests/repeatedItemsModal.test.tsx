/*
  Item Bank → Repeated items. For each name the bank holds more than once, the
  owner picks the one item kept; the rest are hidden as its copies. It changes
  no rate and no project, and a copy can be made an item again.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { orgName: 'Form Factors', tenantId: 't1' } }) }));
vi.mock('../../hooks/useStudioSettings', () => ({ useStudioSettings: () => ({ settings: { customBundles: [] }, updateSettings: vi.fn() }) }));

import RepeatedItemsModal from '../../components/bank/RepeatedItemsModal';
import BankTab from '../../components/BankTab';
import { pickable } from '../../lib/bankMatch';
import { boqTotal, buildBankMap } from '../../lib/boqPricing';

const item = (id: string, name: string, over: any = {}): any => ({
  id, name, cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1260, labor: 540, margin: 15, ...over,
});
const seed = () => [
  item('gen-015', 'KING SIZE BED WITH STORAGE', { specs: 'Fabrication or supply of King size bed with storage.' }),
  item('ADHOC_a1', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1596, labor: 684, margin: 0 }),
  item('ADHOC_a2', 'KING SIZE BED WITH STORAGE', { unit: 'SQFT.', materials: 1663, labor: 713, margin: 0 }),
  item('x1', 'PANELLING', { unit: 'SQFT.', materials: 800, labor: 300, margin: 5 }),
  item('ADHOC_b1', 'PANELLING', { unit: 'SQFT.', materials: 1008, labor: 432, margin: 0 }),
  item('gen-014', 'WARDOBE WITH LOFT'),
];
const projects: any[] = [
  { id: 'p1', lastModified: 100, context: { name: 'Unique Vistas', status: 'won' }, tiers: [{ id: 't1', name: 'Comfort', timestamp: 50, boq: [{ id: 'l1', bankId: 'ADHOC_a1', qty: 10 }, { id: 'l2', bankId: 'ADHOC_b1', qty: 20 }] }] },
  { id: 'p0', lastModified: 20, context: { name: 'Runwal Eirene', status: 'completed' }, tiers: [{ id: 't0', name: 'Comfort', timestamp: 10, boq: [{ id: 'l3', bankId: 'gen-015', qty: 4 }] }] },
];
const total = (bank: any[]) => projects.reduce((sum, p) => sum + boqTotal(p.tiers[0].boq, buildBankMap(bank, [])), 0);

let latest: any[] = [];
function Host({ start = seed(), list = projects, read }: { start?: any[]; list?: any[]; read?: any }) {
  const [bank, setBank] = useState<any[]>(start);
  latest = bank;
  return <RepeatedItemsModal bank={bank} projects={list} setBank={setBank} read={read} onClose={vi.fn()} />;
}
const group = (name: string) => screen.getByRole('radiogroup', { name: `The item to keep for ${name}` });

describe('Repeated items', () => {
  it('lists each repeated name with its copies, the suggested one kept, and changes nothing on opening', () => {
    render(<Host />);
    expect(screen.getByText('KING SIZE BED WITH STORAGE')).toBeTruthy();
    expect(screen.getByText(/3 copies · ₹ 2,070 to ₹ 2,376 · last sold at ₹ 2,280 in Unique Vistas/)).toBeTruthy();
    expect(screen.queryByText('WARDOBE WITH LOFT')).toBeNull();
    // The studio's original is the one kept; for panelling, the one a project uses.
    expect(within(group('KING SIZE BED WITH STORAGE')).getByRole('radio', { name: /₹ 2,070, Original/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(group('PANELLING')).getByRole('radio', { name: /₹ 1,440, Revision Studio/ }).getAttribute('aria-checked')).toBe('true');
    expect(latest).toEqual(seed());
    expect((screen.getByRole('button', { name: /Keep one item for 0 names/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('settles only the ticked name, hides its copies, and moves no project total', async () => {
    render(<Host />);
    const before = total(latest);
    fireEvent.click(screen.getByText('KING SIZE BED WITH STORAGE'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep one item for 1 name' }));
    await screen.findByText(/1 name settled: 2 copies hidden\. No project was changed\./);

    expect(latest.filter(i => i.mergedInto).map(i => [i.id, i.mergedInto])).toEqual([['ADHOC_a1', 'gen-015'], ['ADHOC_a2', 'gen-015']]);
    expect(pickable(latest).map(i => i.id)).toEqual(['gen-015', 'x1', 'ADHOC_b1', 'gen-014']);
    expect(total(latest)).toBe(before);
    // Every item's rate is what it was.
    latest.forEach((i, n) => expect([i.materials, i.labor, i.margin, i.name, i.unit]).toEqual([seed()[n].materials, seed()[n].labor, seed()[n].margin, seed()[n].name, seed()[n].unit]));
    expect(screen.queryByText('KING SIZE BED WITH STORAGE')).toBeNull();
    expect(screen.getByText('PANELLING')).toBeTruthy();
  });

  it('keeps the copy the owner picks instead', async () => {
    render(<Host />);
    fireEvent.click(within(group('KING SIZE BED WITH STORAGE')).getByRole('radio', { name: /₹ 2,376, Revision Studio/ }));
    fireEvent.click(screen.getByText('KING SIZE BED WITH STORAGE'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep one item for 1 name' }));
    await screen.findByText(/1 name settled/);
    expect(pickable(latest).filter(i => /KING/.test(i.name)).map(i => i.id)).toEqual(['ADHOC_a2']);
    expect(latest.find(i => i.id === 'gen-015').mergedInto).toBe('ADHOC_a2');
  });

  it('makes a copy an item again from the Settled list', async () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Tick all 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep one item for 2 names' }));
    expect(await screen.findByText('No name is held more than once.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Settled/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Make the one at ₹ 2,280 an item again' }));
    expect(latest.find(i => i.id === 'ADHOC_a1').mergedInto).toBeUndefined();
    expect(latest.find(i => i.id === 'ADHOC_a2').mergedInto).toBe('gen-015');
  });
});

/*
  The rate the kept item carries is what a new line starts from. It is set here
  only when no project would be re-priced by it: with every line holding its own
  price that is always so, and a line that still follows the bank stops it.
*/
describe('Repeated items: the standard rate', () => {
  const rateOf = (name: string) => screen.getByLabelText(`Standard rate for ${name}`) as HTMLInputElement;
  const sell = (i: any) => (i.materials + i.labor) * (1 + i.margin / 100);
  // Every line holds its whole price, as after Lock prices.
  const locked: any[] = [
    { id: 'p1', lastModified: 100, context: { name: 'Unique Vistas', status: 'won' }, tiers: [{ id: 't1', name: 'Comfort', timestamp: 50, boq: [
      { id: 'l1', bankId: 'ADHOC_a1', qty: 10, baseRate: 1596, labor: 684, marginOverride: 0 },
    ] }] },
    { id: 'p0', lastModified: 20, context: { name: 'Runwal Eirene', status: 'completed' }, tiers: [{ id: 't0', name: 'Comfort', timestamp: 10, boq: [
      { id: 'l3', bankId: 'gen-015', qty: 4, baseRate: 1260, labor: 540, marginOverride: 15 },
    ] }] },
  ];
  const lockedTotal = (bank: any[]) => locked.reduce((sum, p) => sum + boqTotal(p.tiers[0].boq, buildBankMap(bank, [])), 0);

  it('starts at the kept item\'s own rate and offers what the name has been at', () => {
    render(<Host list={locked} />);
    expect(rateOf('KING SIZE BED WITH STORAGE').value).toBe('2070');
    expect(screen.getByRole('button', { name: 'Use ₹ 2,280, last sold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use ₹ 2,376, a copy' })).toBeTruthy();
    expect(screen.getByText('New lines start at ₹ 2,070.')).toBeTruthy();
  });

  it('sets the kept item to the chosen rate when it is settled, and re-prices no project', async () => {
    const read = vi.fn(async () => JSON.parse(JSON.stringify(locked)));
    render(<Host list={locked} read={read} />);
    const before = lockedTotal(latest);
    fireEvent.click(screen.getByRole('button', { name: 'Use ₹ 2,280, last sold' }));
    expect(screen.getByText('New lines will start at ₹ 2,280. Its margin stays 15%.')).toBeTruthy();
    fireEvent.click(screen.getByText('KING SIZE BED WITH STORAGE'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep one item for 1 name' }));
    await screen.findByText(/1 name settled: 2 copies hidden, 1 standard rate set\. No project was changed\./);

    const kept = latest.find(i => i.id === 'gen-015');
    expect(sell(kept)).toBeCloseTo(2280, 3);
    expect(kept.margin).toBe(15);
    expect(kept.rateHistory).toHaveLength(1);
    expect(kept.mergedInto).toBeUndefined();
    expect(latest.filter(i => i.mergedInto).map(i => i.id)).toEqual(['ADHOC_a1', 'ADHOC_a2']);
    // The copies keep their own figures, and the project its total.
    expect(latest.find(i => i.id === 'ADHOC_a1')).toMatchObject({ materials: 1596, labor: 684, margin: 0 });
    expect(lockedTotal(latest)).toBe(before);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('leaves the rate alone, and says why, when a line still follows the bank', async () => {
    // The projects as stored hold a line on the bed with no price of its own.
    const read = vi.fn(async () => [{ id: 'p9', context: { name: 'New Project', status: 'lead' }, tiers: [{ id: 't', name: 'Option 1', boq: [{ id: 'x', bankId: 'gen-015', qty: 40 }] }] }]);
    render(<Host list={locked} read={read} />);
    fireEvent.change(rateOf('KING SIZE BED WITH STORAGE'), { target: { value: '2400' } });
    fireEvent.click(screen.getByText('KING SIZE BED WITH STORAGE'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep one item for 1 name' }));
    await screen.findByText(/1 rate not changed\./);
    expect(screen.getByText(/New Project · Option 1: ₹ 82,800 would become ₹ 96,000/)).toBeTruthy();
    // The name is still settled; only its rate was refused.
    expect(latest.find(i => i.id === 'gen-015')).toMatchObject({ materials: 1260, labor: 540, margin: 15 });
    expect(latest.find(i => i.id === 'gen-015').rateHistory).toBeUndefined();
    expect(latest.filter(i => i.mergedInto)).toHaveLength(2);
  });

  it('sets the rate of a name already settled, and puts it back', async () => {
    const settled = seed().map(i => (i.id.startsWith('ADHOC_a') ? { ...i, mergedInto: 'gen-015' } : i));
    render(<Host start={settled} list={locked} />);
    fireEvent.click(screen.getByRole('radio', { name: /Settled/ }));
    const set = screen.getByRole('button', { name: 'Set the rate for KING SIZE BED WITH STORAGE' }) as HTMLButtonElement;
    expect(set.disabled).toBe(true);
    fireEvent.change(rateOf('KING SIZE BED WITH STORAGE'), { target: { value: '2376' } });
    expect(set.disabled).toBe(false);
    fireEvent.click(set);
    await screen.findByText(/now starts at ₹ 2,376\. No project was changed\./);
    expect(sell(latest.find(i => i.id === 'gen-015'))).toBeCloseTo(2376, 3);
    expect(rateOf('KING SIZE BED WITH STORAGE').value).toBe('2376');

    fireEvent.click(screen.getByRole('button', { name: 'Put ₹ 2,070 back' }));
    await screen.findByText(/is back at ₹ 2,070\./);
    await waitFor(() => expect(latest).toEqual(settled));
  });
});

describe('Item Bank: the Repeated items button', () => {
  const props = { setBank: vi.fn(), aiStrategy: 'balanced' as any, highlightedBankItemId: null, onHighlightClear: vi.fn(), projects };

  it('is for the owner, and says how many names repeat', () => {
    const { unmount } = render(<BankTab {...props} bank={seed()} />);
    expect(screen.queryByRole('button', { name: /Repeated items/ })).toBeNull();
    unmount();
    render(<BankTab {...props} bank={seed()} canSettle />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeated items (2)' }));
    expect(screen.getByRole('dialog', { name: 'Repeated items' })).toBeTruthy();
  });

  it('is not drawn when no name repeats and nothing is hidden', () => {
    render(<BankTab {...props} bank={[seed()[0], seed()[5]]} canSettle />);
    expect(screen.queryByRole('button', { name: /Repeated items/ })).toBeNull();
  });

  it('lists the items only, with a chip for the copies kept out of sight', () => {
    const settled = seed().map(i => (i.id.startsWith('ADHOC_a') ? { ...i, mergedInto: 'gen-015' } : i));
    render(<BankTab {...props} bank={settled} canSettle />);
    expect(screen.getByText(/4 Active Items/)).toBeTruthy();
    fireEvent.click(screen.getByText('2 copies hidden'));
    expect(screen.getByText(/6 Active Items/)).toBeTruthy();
    expect(screen.getByText('2 copies shown')).toBeTruthy();
  });
});
