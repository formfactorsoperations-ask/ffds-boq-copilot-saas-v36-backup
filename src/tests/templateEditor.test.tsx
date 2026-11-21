/*
  Standard templates: a room shows everything about each item, with nothing cut
  short, and the options that take it. The Item bank beside it adds to the room.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/geminiService', () => ({
  aiSuggestRoomItems: vi.fn(async () => []),
  generateAiTemplate: vi.fn(), auditAiTemplate: vi.fn(), splitCost: vi.fn(), isAiAvailable: () => false,
}));

import TemplateEditorTab from '../../components/TemplateEditorTab';
import { gradesFor } from '../../lib/templateOptions';

const LONG = 'OVERHEAD CABINETS ON MAIN PLATFORM WITH MICROWAVE SHELF ON ANGLE AND PROFILE LIGHT BELOW';
const bank: any[] = [
  { id: 'a', name: LONG, cat: 'Modular Kitchen', unit: 'sq ft', specs: 'BWR ply carcass.\nLaminate outside.', materials: 1500, labor: 300, margin: 20 },
  { id: 'b', name: 'Wall cabinets box storage', cat: 'Modular Kitchen', unit: 'sq ft', specs: '', materials: 2000, labor: 475, margin: 20 },
  { id: 'c', name: 'Crockery unit', cat: 'Carpentry', unit: 'sq ft', specs: '', materials: 1700, labor: 300, margin: 20 },
];

let latest: any;
const Screen: React.FC = () => {
  const [t, setT] = useState<any>({ '3-BHK': { kitchen: ['a', 'b', 'gone'], dining: [] }, '2-BHK': { living: ['c'] } });
  latest = t;
  return <TemplateEditorTab bank={bank} templates={t} setTemplates={setT} />;
};
const room = () => screen.getByRole('region', { name: 'kitchen in 3-BHK' });

describe('Standard templates', () => {
  it('shows a room’s items in full: the whole name, rate, unit and specification', () => {
    render(<Screen />);
    const r = room();
    expect(within(r).getByText(LONG)).toBeTruthy();
    expect(within(r).getAllByText('per sq ft').length).toBe(2);
    expect(within(r).getByText('₹2,160')).toBeTruthy();
    expect(within(r).getByText(/BWR ply carcass/)).toBeTruthy();
    expect(within(r).getByText('2 items')).toBeTruthy();
    // An id the bank no longer has was skipped silently; now it is said.
    expect(within(r).getByText('1 no longer in the bank')).toBeTruthy();
  });

  it('marks the options that take an item, and counts them', () => {
    render(<Screen />);
    const group = within(room()).getByRole('group', { name: `Options that take ${LONG}` });
    fireEvent.click(within(group).getByRole('button', { name: 'E' }));
    expect(gradesFor(latest['3-BHK'], 'kitchen', 'a')).toEqual(['C', 'P']);
    expect(within(room()).getByText('Extra')).toBeTruthy();
    expect(within(room()).getByText('E · 1')).toBeTruthy();
    expect(within(room()).getByText('H · 2')).toBeTruthy();
  });

  it('adds from the Item bank beside the room, and takes an item out', () => {
    render(<Screen />);
    const picker = screen.getByRole('complementary', { name: 'Item bank' });
    expect((within(picker).getByRole('button', { name: `${LONG} is in this room` }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(picker).getByRole('button', { name: 'Add Crockery unit' }));
    expect(latest['3-BHK'].kitchen).toEqual(['a', 'b', 'gone', 'c']);
    fireEvent.click(within(room()).getByRole('button', { name: 'Take Crockery unit out of kitchen' }));
    expect(latest['3-BHK'].kitchen).toEqual(['a', 'b', 'gone']);
  });

  it('switches room and typology', async () => {
    render(<Screen />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Room scopes' })).getByRole('button', { name: /dining/i }));
    expect(screen.getByText('Nothing in this room yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '2-BHK' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'living in 2-BHK' })).toBeTruthy());
  });
});
