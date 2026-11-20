/* The rooms off the client's floor plan (services/planRooms), shared by the setup wizard and Brief & Site. */
import { describe, it, expect, vi } from 'vitest';

const analyze = vi.fn();
vi.mock('../../services/geminiService', () => ({
  analyzeFloorPlan: (...a: any[]) => analyze(...a),
  estimateRoomSizes: vi.fn(async () => []),
  isAiAvailable: () => false,
}));

import { readRoomsFromPlan, configFromRooms } from '../../services/planRooms';

describe('reading the rooms off a plan', () => {
  it('takes the area from the rooms and the BHK from the bedrooms it read', async () => {
    analyze.mockResolvedValueOnce([
      { name: 'Bedroom', size: 110, unit: 'sq ft' }, { name: 'Bedroom', size: 70, unit: 'sq ft' }, { name: 'Master Bedroom', size: 120, unit: 'sq ft' },
      { name: 'Toilet', size: 40, unit: 'sq ft' }, { name: 'Kitchen', size: 56, unit: 'sq ft' }, { name: 'Living / Dining', size: 220, unit: 'sq ft' },
    ]);
    const read = await readRoomsFromPlan('/9j/IMG', { area: 0, config: '2-BHK' });
    expect(analyze).toHaveBeenCalledWith('/9j/IMG', 0);
    expect(read.read).toBe(6);
    expect(read.area).toBe(616);
    expect(read.config).toBe('3-BHK');
    // Names unique, and the flat-wide scopes are there.
    const names = read.rooms.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['Civil', 'Functional', 'Others']));
  });

  it('leaves the BHK alone when the plan shows no bedrooms', () => {
    expect(configFromRooms([{ name: 'Toilet', size: 40 } as any])).toBeNull();
  });
});
