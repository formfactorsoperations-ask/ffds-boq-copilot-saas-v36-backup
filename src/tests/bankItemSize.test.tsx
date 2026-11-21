/*
  An Item Bank card says the standard size its item starts every BOQ at, and
  opens the drawer at it. It was reachable only through the card's Recipe chip,
  which says nothing about size.
*/
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({ splitCost: vi.fn(), isAiAvailable: () => false }));

import BankItemCard from '../../components/BankItemCard';
import { studioStandard } from '../../lib/materialSpecs';

const specBank = studioStandard();
const item = (name: string, unit: string, extra: any = {}): any => ({ id: 'x1', name, cat: 'Carpentry', unit, specs: '', materials: 1500, labor: 600, margin: 15, ...extra });
const card = (it: any, onOpenRecipe = vi.fn()) => {
  render(<BankItemCard item={it} onUpdate={vi.fn()} onDelete={vi.fn()} aiStrategy={'balanced' as any} specBank={specBank} onOpenRecipe={onOpenRecipe} />);
  return onOpenRecipe;
};

describe('the standard size on an Item Bank card', () => {
  it('shows the size and opens the drawer at it', () => {
    const open = card(item('CROCKERY UNIT', 'sq ft'));
    fireEvent.click(screen.getByRole('button', { name: 'Size 4′ × 7′' }));
    expect(open).toHaveBeenCalledWith('x1', 'size');
  });

  it('shows the owner’s own size over the one its name suggests', () => {
    card(item('CROCKERY UNIT', 'sq ft', { draw: { kind: 'cabinet', w: 5, h: 8, d: 1.5, mount: 'wall' } }));
    expect(screen.getByRole('button', { name: 'Size 5′ × 8′' })).toBeTruthy();
  });

  it('a running item shows its width', () => {
    card(item('Kitchen base unit', 'rft'));
    expect(screen.getByRole('button', { name: 'Size 6′' })).toBeTruthy();
  });

  it('asks for a size on a measured item that has none', () => {
    const open = card(item('HEADBOARD', 'sq ft'));
    fireEvent.click(screen.getByRole('button', { name: 'Set size' }));
    expect(open).toHaveBeenCalledWith('x1', 'size');
  });

  it('says nothing for what is counted, a lump sum, or measured from the plan', () => {
    card(item('Queen bed', 'nos'));
    card(item('Interior painting', 'sq ft', { cat: 'Painting' }));
    card(item('Debris removal', 'lumpsum', { cat: 'Site Services' }));
    card(item('POP FALSE CEILING (Standard)', 'sq ft', { cat: 'Functional' }));
    card(item('Wall tiles', 'sq ft', { cat: 'Functional' }));
    card(item('Electrical wiring', 'rft', { cat: 'Functional' }));
    expect(screen.queryByRole('button', { name: /^Size|^Set size/ })).toBeNull();
  });
});
