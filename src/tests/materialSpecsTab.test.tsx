import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const role = { current: 'Owner' };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 'studio_a', playground: true }, currentRole: role.current, currentRoles: [role.current], currentUserAuth: { displayName: 'Anish K.' } }),
}));

import MaterialSpecsTab from '../../components/materialSpecs/MaterialSpecsTab';
import RecipeDrawer from '../../components/materialSpecs/RecipeDrawer';
import { versionsAppendOnly, studioStandard, currentVersion } from '../../lib/materialSpecs';

const std = studioStandard();
const saved: any[] = [];
const specs = () => ({ bank: std, stored: null, loaded: true, error: null, save: vi.fn(async (b: any) => { saved.push(b); }) });
const items: any[] = [
  { id: 'w', name: 'Sliding wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1500, labor: 400, margin: 25 },
  { id: 's', name: 'Three-seater sofa', cat: 'Furniture', unit: 'nos', specs: 'Linen sofa', materials: 50000, labor: 0, margin: 20 },
];
const projects: any[] = [{ id: 'p1', context: { name: 'Palacia – 3BHK' }, tiers: [{ id: 't1', boq: [{ id: 'l', bankId: 'w', qty: 1, materialSpecs: { Hardware: { id: 'hw-ss', v: 1 } } }] }] }];

afterEach(cleanup);
beforeEach(() => { saved.length = 0; });

describe('the Material specs screen', () => {
  it('shows each family’s materials with their words, grades and where they are used', () => {
    role.current = 'Owner';
    render(<MaterialSpecsTab specs={specs()} items={items} projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /^Hardware/ }));
    const card = screen.getByRole('button', { name: /Soft-close hinges and channels/ });
    expect(within(card).getByText('“soft-close stainless steel hinges and telescopic channels”')).toBeTruthy();
    expect(within(card).getByText('1 items · 1 lines')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sliding wardrobe' })).toBeTruthy();
  });

  it('lets the Owner save hardware as v2, append-only, and says who stays on v1', async () => {
    role.current = 'Owner';
    const s = specs();
    render(<MaterialSpecsTab specs={s} items={items} projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /^Hardware/ }));
    fireEvent.change(screen.getByLabelText('Words the client reads'), { target: { value: 'soft-close hinges and Hafele channels' } });
    expect(screen.getByText('This becomes version 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What changed, for the history'), { target: { value: 'Hafele named' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as v2' }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(versionsAppendOnly(std, saved[0])).toBe(true);
    expect(currentVersion(saved[0], 'hw-ss')).toMatchObject({ v: 2, words: 'soft-close hinges and Hafele channels', note: 'Hafele named', by: 'Anish K.' });
    expect(await screen.findByText('Saved as version 2')).toBeTruthy();
    expect(screen.getByText('Palacia – 3BHK')).toBeTruthy();
    expect(screen.getByText('Update in its BOQ')).toBeTruthy();
  });

  it('shows everyone else the bank read-only', () => {
    role.current = 'Designer';
    render(<MaterialSpecsTab specs={specs()} items={items} />);
    expect((screen.getByLabelText('Words the client reads') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Save as v/ })).toBeNull();
    expect(screen.getByRole('list', { name: /versions/ })).toBeTruthy();
  });

  it('adds a material at v1 from New material', async () => {
    role.current = 'Owner';
    render(<MaterialSpecsTab specs={specs()} addSignal={1} />);
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'Plywood 12 mm' } });
    fireEvent.change(screen.getByLabelText('Words the client reads'), { target: { value: '12 mm plywood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add at v1' }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0].materials.at(-1)).toMatchObject({ name: 'Plywood 12 mm', fam: 'ply' });
  });

  it('shows a finish priced as a range: its size, examples and what it holds', () => {
    role.current = 'Designer';
    render(<MaterialSpecsTab specs={specs()} items={items} projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /^Outer finishes/ }));
    expect(screen.getByText(/5 materials · 5 priced as ranges, 730\+ shades in all · a line names the range, the client picks at Selections/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Designer laminate, 1 mm/ }));
    expect(screen.getByText('Priced as a range')).toBeTruthy();
    const egs = screen.getByRole('list', { name: 'Designer laminate, 1 mm: examples' });
    expect(within(egs).getAllByRole('listitem')).toHaveLength(8);
    expect(within(egs).getByText('Smoked oak')).toBeTruthy();
    expect(screen.getByText(/Every shade in this range costs the same/)).toBeTruthy();
    expect(screen.getByText('Synchronised woodgrains, textures and stones · Merino · Greenlam · Royale Touche')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Example' })).toBeNull();
  });

  it('lets the Owner add an example, saved as a new version with the range', async () => {
    role.current = 'Owner';
    render(<MaterialSpecsTab specs={specs()} items={items} projects={projects} />);
    fireEvent.click(screen.getByRole('button', { name: /^Outer finishes/ }));
    fireEvent.click(screen.getByRole('button', { name: /Designer laminate, 1 mm/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Example' }));
    fireEvent.change(screen.getByLabelText('Example'), { target: { value: 'Walnut 21071' } });
    fireEvent.change(screen.getByLabelText('Catalogue code'), { target: { value: 'Merino 21071' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add example' }));
    expect(screen.getByText('This becomes version 3')).toBeTruthy();
    expect(screen.getByText('Walnut 21071', { selector: 'b' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save as v3' }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(versionsAppendOnly(std, saved[0])).toBe(true);
    const v3 = currentVersion(saved[0], 'lam-oak')!;
    expect(v3).toMatchObject({ v: 3, words: '1 mm textured designer laminate', note: 'Range examples changed', costFactor: 1 });
    expect(v3.range!.examples).toHaveLength(9);
    expect(v3.range!.examples.at(-1)).toEqual({ name: 'Walnut 21071', hex: '#c9a37a', code: 'Merino 21071' });
  });
});

describe('the item’s recipe drawer', () => {
  it('shows the recipe by option and what the client reads; the Owner changes a part', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<RecipeDrawer item={items[0]} specs={std} canEditRecipes canEditItem projects={9} sharedBy={() => 12} onSave={onSave} onClose={() => {}} />);
    expect(screen.getByText('Spec recipe')).toBeTruthy();
    expect(screen.getByText(/It is shared by 12 items of this kind/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Hardware in Comfort Upgrade' }), { target: { value: 'hw-hettich' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const change = (onSave.mock.calls[0] as any)[0];
    expect(change.bank.recipes.carp.parts.find((p: any) => p.part === 'Hardware').byGrade.C).toBe('hw-hettich');
  });

  it('only the Owner changes a recipe', () => {
    render(<RecipeDrawer item={items[0]} specs={std} canEditRecipes={false} canEditItem projects={1} sharedBy={() => 1} onSave={vi.fn()} onClose={() => {}} />);
    expect((screen.getByRole('combobox', { name: 'Hardware in Comfort Upgrade' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText('Only the studio Owner changes a recipe.')).toBeTruthy();
  });

  it('an item with no recipe keeps its typed words, and can start one', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<RecipeDrawer item={items[1]} specs={std} canEditRecipes canEditItem projects={1} sharedBy={() => 1} onSave={onSave} onClose={() => {}} />);
    expect(screen.getByText('No recipe yet')).toBeTruthy();
    expect(screen.getByText(/Linen sofa/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Start from' }), { target: { value: 'carp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start a recipe' }));
    expect(screen.getByText('Spec recipe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ recipeId: 'carp' }));
  });
});
