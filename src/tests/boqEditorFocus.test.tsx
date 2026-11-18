/*
  The BOQ Editor opened at a line, from Pricing & Tiers' "Where the money goes":
  the line's room is shown and the line is selected, even when the editor was
  showing another room.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't' }, currentRole: 'Owner', currentRoles: ['Owner'], currentUserAuth: { displayName: 'P' } }),
}));

import { InteractiveBoqEditor } from '../../components/InteractiveBoqEditor';

afterEach(cleanup);

const line = (id: string, name: string, roomId: string) =>
  ({ id, bankId: `b${id}`, name, cat: 'Carpentry', unit: 'sqft', qty: 10, materials: 100, labor: 0, margin: 20, roomId, specs: '' }) as any;
const ITEMS = [line('a', 'Bed back panel', 'Bedroom'), line('b', 'Kitchen base units', 'Kitchen')];
const ROOMS: any[] = [{ name: 'Bedroom', size: 100, unit: 'sq ft' }, { name: 'Kitchen', size: 80, unit: 'sq ft' }];
const props = { items: ITEMS, rooms: ROOMS, bank: [], onUpdate: vi.fn(), onDelete: vi.fn(), setTiers: vi.fn(), activeTierId: 't1' };

describe('BOQ Editor opened at a line', () => {
  it('shows the line’s room and selects it', () => {
    const { rerender } = render(<InteractiveBoqEditor {...props} />);
    expect(screen.queryByDisplayValue('Kitchen base units')).toBeNull(); // no line selected, Bedroom shown
    rerender(<InteractiveBoqEditor {...props} focus={{ ids: ['b'], at: 1 }} />);
    expect(screen.getByDisplayValue('Kitchen base units')).toBeTruthy(); // its detail panel is open
  });

  it('ignores a line that is not in this option', () => {
    render(<InteractiveBoqEditor {...props} focus={{ ids: ['zzz'], at: 1 }} />);
    expect(screen.queryByDisplayValue('Kitchen base units')).toBeNull();
    expect(screen.queryByDisplayValue('Bed back panel')).toBeNull();
  });
});
