/*
  The windows Standard templates opens: Add room, New typology, AI audit and
  Preview the options.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const audit = vi.fn();
vi.mock('../../services/geminiService', () => ({
  auditAiTemplate: (...a: any[]) => audit(...a),
  generateAiTemplate: vi.fn(), aiSuggestRoomItems: vi.fn(async () => []), splitCost: vi.fn(), isAiAvailable: () => false,
}));

import { AddRoomScopeModal } from '../../components/templates/AddRoomScopeModal';
import { AddTypologyModal } from '../../components/templates/AddTypologyModal';
import { AiTemplateAuditDrawer } from '../../components/templates/AiTemplateAuditDrawer';
import { TemplateThreeTierPreviewModal } from '../../components/templates/TemplateThreeTierPreviewModal';
import { INITIAL_TEMPLATES, generateStandardPackages } from '../../lib/standardPackages';
import { INITIAL_BANK } from '../../constants';
import { formatINR } from '../../lib/utils';

afterEach(() => { cleanup(); audit.mockReset(); });

describe('Add a room', () => {
  it('adds a usual room, and a named one in the form it is stored', () => {
    const add = vi.fn();
    render(<AddRoomScopeModal isOpen onClose={vi.fn()} existingRooms={['living']} onAddRoom={add} />);
    expect((screen.getByRole('button', { name: /Living Room/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Another room'), { target: { value: 'Terrace Deck' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(add).toHaveBeenCalledWith('terrace_deck');
  });

  it('says why a name cannot be added, as it is typed', () => {
    render(<AddRoomScopeModal isOpen onClose={vi.fn()} existingRooms={['living']} onAddRoom={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Another room'), { target: { value: 'Living' } });
    expect(screen.getByRole('alert').textContent).toBe('This typology already has that room.');
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('New typology', () => {
  it('starts from a set of empty rooms', () => {
    const add = vi.fn();
    render(<AddTypologyModal isOpen onClose={vi.fn()} existingConfigs={['2-BHK']} onAddConfig={add} />);
    const create = screen.getByRole('button', { name: 'Create typology' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '2-bhk' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('radio', { name: /Kitchen Overhaul/ }));
    fireEvent.click(create);
    expect(add).toHaveBeenCalledWith('Studio', ['kitchen', 'dining', 'general'], undefined);
  });

  it('or as a copy of another', () => {
    const add = vi.fn();
    render(<AddTypologyModal isOpen onClose={vi.fn()} existingConfigs={['2-BHK', '3-BHK']} onAddConfig={add} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '3-BHK large' } });
    fireEvent.click(screen.getByRole('radio', { name: 'A copy of another' }));
    fireEvent.change(screen.getByLabelText('Copy the rooms and items of'), { target: { value: '3-BHK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create typology' }));
    expect(add).toHaveBeenCalledWith('3-BHK large', expect.any(Array), '3-BHK');
  });
});

describe('AI audit', () => {
  const bank: any[] = [{ id: 'w', name: 'Point wiring', cat: 'Electrical', unit: 'nos', materials: 300, labor: 200, margin: 20 }];
  const result = {
    score: 72, summary: 'Thin on electrical.', strengths: ['Wardrobes in every bedroom.'],
    missingTrades: [
      { trade: 'Electrical', roomType: 'general', reason: 'No wiring.', suggestedBankItemIds: ['w'] },
      { trade: 'Civil', roomType: 'bathroom', reason: 'No waterproofing.', suggestedBankItemIds: [], suggestedNewItemName: 'Waterproofing' },
    ],
    tierStrategyAdvice: { essential: 'a', comfort: 'b', harmony: 'c' },
  };

  /* The typology changes when a gap is added, as it does on the real screen. */
  const Host: React.FC<{ added: (x: any) => void }> = ({ added }) => {
    const [rooms, setRooms] = useState<Record<string, string[]>>({ general: [] });
    return <AiTemplateAuditDrawer isOpen onClose={vi.fn()} configName="3-BHK" rooms={{ ...rooms }} bank={bank}
      onAddMissingItems={(x) => { added(x); setRooms(r => ({ ...r, general: [...r.general, ...x.map(i => i.itemId)] })); }} />;
  };

  it('audits once, and keeps the audit when a gap is added', async () => {
    audit.mockResolvedValue(result);
    const added = vi.fn();
    render(<Host added={added} />);
    await screen.findByText('Thin on electrical.');
    const buttons = screen.getAllByRole('button', { name: 'Add to the room' }) as HTMLButtonElement[];
    expect(buttons[1].disabled).toBe(true);
    expect(screen.getByText('Waterproofing')).toBeTruthy();
    fireEvent.click(buttons[0]);
    expect(added).toHaveBeenCalledWith([{ roomType: 'general', itemId: 'w' }]);
    await screen.findByText('Added');
    // It used to audit again each time the typology changed, throwing this list away.
    expect(screen.getByText('Thin on electrical.')).toBeTruthy();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('says so when the audit fails', async () => {
    audit.mockRejectedValue(new Error('AI is not available.'));
    render(<Host added={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toBe('AI is not available.');
  });
});

describe('Preview the options', () => {
  it('shows the generator’s three options, each room’s lines adding up to its option’s quote', async () => {
    render(<TemplateThreeTierPreviewModal isOpen onClose={vi.fn()} configName="3-BHK" templates={INITIAL_TEMPLATES} bank={INITIAL_BANK as any} />);
    const tiers = generateStandardPackages({ name: 'x', type: 'TURNKEY', area: 1000, ceilingHeight: 9.5, config: '3-BHK', rooms: [] } as any, INITIAL_BANK as any, INITIAL_TEMPLATES, 'tiered');
    expect(tiers.length).toBe(3);
    const rupees = (s: string) => Number(s.replace(/[^0-9]/g, ''));
    for (const tier of tiers) {
      const card = screen.getByRole('article', { name: tier.name });
      await waitFor(() => expect(within(card).getByText(formatINR(Math.round(tier.summary.totalSell)))).toBeTruthy());
      const roomTotals = within(card).getAllByRole('button', { expanded: true }).map(b => rupees(b.lastElementChild!.textContent || ''));
      const sum = roomTotals.reduce((a, b) => a + b, 0);
      // Each room's figure is rounded for display, so allow a rupee a room.
      expect(Math.abs(sum - Math.round(tier.summary.totalSell))).toBeLessThanOrEqual(roomTotals.length);
    }
  });
});
