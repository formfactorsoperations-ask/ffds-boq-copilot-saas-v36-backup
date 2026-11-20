/*
  The client's plan as a clean plan (lib/playground/walls, planFromDrawing):
  walls found in the drawing, rough boxes snapped onto them, tidied so rooms
  share walls, a passage grown to the rooms it reaches, doors and windows from
  the gaps in the walls.
*/
import { describe, it, expect } from 'vitest';
import { darkMask, wallMask, wallThicknessPx, snapToWalls, gapsOf, type Mask } from '../../lib/playground/walls';
import { planFromDrawing } from '../../lib/playground/planFromDrawing';

/* A drawing 400 × 200 px: walls 8 px thick, a door gap and a window gap, furniture drawn in 2 px lines. */
function drawing(): { rgba: Uint8ClampedArray; w: number; h: number } {
  const w = 400, h = 200;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const ink = (x0: number, y0: number, x1: number, y1: number, grey = 70) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = grey; rgba[i + 3] = 255;
    }
  };
  // Outside walls, centred on x 20 / 380 and y 20 / 180.
  ink(16, 16, 384, 24);            // top, with a window gap cut below
  ink(16, 176, 384, 184);          // bottom
  ink(16, 16, 24, 184);            // left
  ink(376, 16, 384, 184);          // right
  // The inside wall at x = 200 between the two rooms, with a door gap from y 80 to 120.
  ink(196, 16, 204, 80);
  ink(196, 120, 204, 184);
  // A window in the top wall of the right room: x 260 to 320 left white.
  for (let y = 16; y < 24; y++) for (let x = 260; x < 320; x++) { const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 255; }
  // Furniture: a bed outline in thin lines.
  ink(60, 60, 140, 62); ink(60, 120, 140, 122); ink(60, 60, 62, 122); ink(138, 60, 140, 122);
  return { rgba, w, h };
}

describe('the walls of a drawing', () => {
  const d = drawing();
  const dark = darkMask(d.rgba, d.w, d.h);

  it('measures how thick the walls are, and keeps the walls without the furniture', () => {
    expect(wallThicknessPx(dark)).toBe(8);
    const { mask, radius } = wallMask(dark);
    expect(radius).toBeGreaterThan(0);
    const at = (m: Mask, x: number, y: number) => m.on[y * m.w + x];
    expect(at(mask, 200, 40)).toBe(1);   // the inside wall
    expect(at(mask, 100, 61)).toBe(0);   // the bed's outline
  });

  it('leaves a line drawing’s thin walls as they are', () => {
    const w = 100, h = 100, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let x = 0; x < w; x++) { const i = (50 * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; }
    const { mask, radius } = wallMask(darkMask(rgba, w, h));
    expect(radius).toBe(0);
    expect(mask.on[50 * w + 30]).toBe(1);
  });

  it('snaps a rough box onto the walls, and finds the door and the window', () => {
    const { mask } = wallMask(dark);
    const s = snapToWalls({ x: 212, y: 30, w: 150, h: 140 }, mask, 25);
    expect(s.snapped).toBe(4);
    expect(Math.round(s.x)).toBe(200);
    expect(Math.round(s.x + s.w)).toBe(380);
    expect(Math.round(s.y)).toBe(20);
    expect(Math.round(s.y + s.h)).toBe(180);
    const gaps = gapsOf({ x: 200, y: 20, w: 180, h: 160 }, mask, 5, 20, 80);
    expect(gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: 'left' }),
      expect.objectContaining({ side: 'top' }),
    ]));
  });
});

describe('a clean plan from the drawing', () => {
  const d = drawing();
  const { mask, thickness } = wallMask(darkMask(d.rgba, d.w, d.h));
  // 0.05 ft a pixel: each room is 180 × 160 px = 9 × 8 ft, printed.
  const box = (name: string, x0: number, y0: number, x1: number, y1: number) => ({
    name, lengthFt: 9, widthFt: 8, dimensionPrinted: true, box: { x: x0 / 400, y: y0 / 200, w: (x1 - x0) / 400, h: (y1 - y0) / 200 },
  });

  it('puts rough, overlapping boxes on one shared wall, with the door between them and the window outside', () => {
    const out = planFromDrawing([box('BEDROOM', 28, 30, 214, 172), box('LIVING', 190, 26, 366, 176)], { w: 400, h: 200 }, mask, thickness)!;
    expect(out.ftPerPx).toBeCloseTo(0.05, 2);
    const [bed, living] = out.rooms;
    expect(bed.plan.x + bed.plan.w).toBe(living.plan.x);   // one wall between them
    expect(bed.plan.y).toBe(living.plan.y);
    expect(bed.plan.h).toBe(living.plan.h);
    expect(out.overlaps).toBe(0);
    // The door opens into the bedroom, not into the living room it is reached from.
    expect(bed.openings).toEqual([expect.objectContaining({ kind: 'door', side: 'right' })]);
    expect(living.openings).toEqual([expect.objectContaining({ kind: 'window', side: 'top' })]);
    const win = living.openings[0];
    expect(win.w).toBeGreaterThan(2.5);
    expect(win.w).toBeLessThan(3.5);
  });

  it('grows a passage the reading stopped short across the empty floor to the next room', () => {
    const out = planFromDrawing([
      box('BEDROOM', 28, 30, 196, 172),
      { ...box('PASSAGE', 260, 30, 372, 172), dimensionPrinted: false },
    ], { w: 400, h: 200 }, null, 0)!;
    // Without the drawing's walls nothing is known to stop it, so it is left; with them, the gap closes.
    const withWalls = planFromDrawing([
      box('BEDROOM', 28, 30, 196, 172),
      { ...box('PASSAGE', 260, 30, 372, 172), dimensionPrinted: false },
    ], { w: 400, h: 200 }, mask, thickness)!;
    const [bed, passage] = withWalls.rooms;
    expect(passage.plan.x).toBe(bed.plan.x + bed.plan.w);
    expect(out.rooms[1].plan.x).toBeGreaterThan(out.rooms[0].plan.x + out.rooms[0].plan.w);
  });

  it('gives no plan without a printed size, and keeps a scale the studio set', () => {
    expect(planFromDrawing([{ ...box('ROOM', 28, 30, 196, 172), dimensionPrinted: false }], { w: 400, h: 200 }, mask, thickness)).toBeNull();
    const set = planFromDrawing([{ ...box('ROOM', 28, 30, 196, 172), dimensionPrinted: false }], { w: 400, h: 200 }, mask, thickness, 0.1)!;
    expect(set.ftPerPx).toBe(0.1);
  });
});
