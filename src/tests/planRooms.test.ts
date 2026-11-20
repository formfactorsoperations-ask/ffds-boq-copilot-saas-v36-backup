/* The rooms off the client's floor plan (services/planRooms), shared by the setup wizard and Brief & Site. */
import { describe, it, expect, vi } from 'vitest';

const analyze = vi.fn();
const boxes = vi.fn();
vi.mock('../../services/geminiService', () => ({
  analyzeFloorPlan: (...a: any[]) => analyze(...a),
  readPlanBoxes: (...a: any[]) => boxes(...a),
  estimateRoomSizes: vi.fn(async () => []),
  isAiAvailable: () => false,
}));

const store = vi.fn(async () => ({ imageUrl: 'https://x/o/drawn.jpg', imagePx: { w: 1000, h: 700 }, base64: '' }));
vi.mock('../../services/planImage', () => ({
  imageSizeOf: vi.fn(async () => ({ w: 1000, h: 700 })),
  storePlanImage: (...a: any[]) => (store as any)(...a),
}));

import { readRoomsFromPlan, readPlanOntoSheet, configFromRooms } from '../../services/planRooms';

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

  it('puts the plan under the BOQ: its scale from the printed sizes, each room where it is drawn', async () => {
    const room = (name: string, L: number, W: number) => ({ name, size: L * W, unit: 'sq ft', length: L, width: W, dimSource: 'read' });
    const box = (name: string, L: number, W: number, x: number, y: number, w: number, h: number) => ({ name, lengthFt: L, widthFt: W, dimensionPrinted: true, box: { x, y, w, h } });
    // 1000 × 700 px, 0.05 ft a pixel: a 15 × 12 ft room is 300 × 240 px.
    boxes.mockResolvedValueOnce({
      rooms: [room('Living', 15, 12), room('Toilet', 8, 5), room('Toilet', 5, 4)],
      boxes: [box('Living', 15, 12, 0, 0, 0.3, 240 / 700), box('Toilet', 8, 5, 0.3, 0, 0.16, 100 / 700), box('Toilet', 5, 4, 0.46, 0, 0.1, 80 / 700)],
    });
    const read = await readPlanOntoSheet('/9j/IMG', { area: 0, config: '1-BHK' }, { tenantId: 't1', imageUrl: 'https://x/o/plan.jpg' });
    expect(store).not.toHaveBeenCalled();
    expect(read.sheet).toMatchObject({ source: 'brief', imageUrl: 'https://x/o/plan.jpg', imagePx: { w: 1000, h: 700 } });
    expect(read.sheet!.ftPerPx).toBeCloseTo(0.05, 3);
    expect(read.onPlan).toBe(3);
    const placed = read.rooms.filter(r => r.plan);
    expect(placed).toHaveLength(3);
    // The second "Toilet" box went to the second toilet, whatever it is called now; printed sizes are kept.
    const small = placed.find(r => r.length === 5)!;
    expect(small.plan).toMatchObject({ x: 23, y: 0, w: 5, h: 4 });
  });

  it('stores a drawn PDF page as the image, and leaves the plan off the BOQ when no size is printed', async () => {
    boxes.mockResolvedValueOnce({ rooms: [{ name: 'Living', size: 180, unit: 'sq ft' }], boxes: [{ name: 'Living', box: { x: 0, y: 0, w: 0.3, h: 0.3 } }] });
    const none = await readPlanOntoSheet('/9j/IMG', { area: 0, config: '1-BHK' }, { tenantId: 't1', imageUrl: null });
    expect(none.sheet).toBeNull();
    expect(none.onPlan).toBe(0);

    boxes.mockResolvedValueOnce({ rooms: [{ name: 'Living', size: 180, unit: 'sq ft', dimSource: 'read' }], boxes: [{ name: 'Living', lengthFt: 15, widthFt: 12, dimensionPrinted: true, box: { x: 0, y: 0, w: 0.3, h: 240 / 700 } }] });
    const pdf = await readPlanOntoSheet('/9j/IMG', { area: 0, config: '1-BHK' }, { tenantId: 't1', imageUrl: null });
    expect(store).toHaveBeenCalledWith('t1', '/9j/IMG');
    expect(pdf.sheet!.imageUrl).toBe('https://x/o/drawn.jpg');
  });
});
