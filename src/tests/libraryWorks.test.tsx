/*
  The design library's Works tab: the Item Bank's items that are not drawn on
  the plan (civil, plumbing, electrical, site work). The library listed only
  what draws, so a tiling or plumbing line could not be added from it.
*/
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Catalogue from '../../components/playground/Catalogue';

afterEach(cleanup);

const bank: any[] = [
  { id: 'w', name: 'Wardrobe', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1300, labor: 700, margin: 10 },
  { id: 't', name: 'Wall tiles, laid', cat: 'Civil', unit: 'sq ft', specs: '', materials: 90, labor: 60, margin: 20 },
  { id: 'p', name: 'Plumbing point', cat: 'Plumbing', unit: 'nos', specs: '', materials: 1200, labor: 800, margin: 20 },
  { id: 'h', name: 'Hob and chimney', cat: 'Appliances', unit: 'nos', specs: '', materials: 38000, labor: 0, margin: 0, supply: 'client' },
];
const lib = (onAddWork?: (i: any) => void) => render(
  <Catalogue bank={bank} readOnly={false} onClose={vi.fn()} onAdd={vi.fn()} addLabel="to Master Bathroom" onAddWork={onAddWork} />,
);

describe('the design library’s Works tab', () => {
  it('lists what is not drawn and not bought by the client', () => {
    lib(vi.fn());
    fireEvent.click(screen.getByRole('radio', { name: 'Works' }));
    expect(screen.getByText('Wall tiles, laid')).toBeTruthy();
    expect(screen.getByText('Plumbing point')).toBeTruthy();
    expect(screen.queryByText('Wardrobe')).toBeNull();
    expect(screen.queryByText('Hob and chimney')).toBeNull();
  });

  it('adds a work to the room the screen is in', () => {
    const add = vi.fn();
    lib(add);
    fireEvent.click(screen.getByRole('radio', { name: 'Works' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Plumbing point to Master Bathroom' }));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: 'p' }));
  });

  it('filters by trade and by name', () => {
    lib(vi.fn());
    fireEvent.click(screen.getByRole('radio', { name: 'Works' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plumbing' }));
    expect(screen.queryByText('Wall tiles, laid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Filter the works'), { target: { value: 'tiles' } });
    expect(screen.getByText('Wall tiles, laid')).toBeTruthy();
    expect(screen.queryByText('Plumbing point')).toBeNull();
  });

  it('is not offered where the screen cannot add a work', () => {
    lib();
    expect(screen.queryByRole('radio', { name: 'Works' })).toBeNull();
  });
});
