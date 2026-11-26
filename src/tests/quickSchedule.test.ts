import { describe, it, expect } from 'vitest';
import {
  ringOf, ringTotal, movable, moveBoundary, nudge, partnerOf, splitStage, removeStage, spread, reshape, drawnWidths, milestonesFromRings, RING_MIN_DRAWN,
} from '../../lib/quickSchedule';

let n = 0;
const newId = () => `n${n++}`;
const seg = (id: string, pct: number, locked = false, name = id) => ({ id, name, pct, locked });

describe('a ring of milestones', () => {
  it('reads a track, a fixed amount at its share and paid or invoiced locked', () => {
    const ms: any[] = [
      { id: 'd1', type: 'design', name: 'Sign-up', percentage: 25, status: 'paid' },
      { id: 'd2', type: 'design', name: 'Layouts', percentage: 0, isFixedAmount: true, fixedAmount: 30000 },
      { id: 'e1', type: 'execution', name: 'Material', percentage: 100 },
    ];
    expect(ringOf(ms, 'design', 100000)).toEqual([seg('d1', 25, true, 'Sign-up'), seg('d2', 30, false, 'Layouts')]);
  });

  it('moves a boundary between two stages and never leaves 100%', () => {
    const r = [seg('a', 25), seg('b', 40), seg('c', 35)];
    const out = moveBoundary(r, 1, 32);
    expect(out.map(s => s.pct)).toEqual([32, 33, 35]);
    expect(ringTotal(out)).toBe(100);
    expect(moveBoundary(r, 1, 99).map(s => s.pct)).toEqual([64, 1, 35]);
  });

  it('has no handle next to a locked stage', () => {
    const r = [seg('a', 25, true), seg('b', 40), seg('c', 35)];
    expect(movable(r, 1)).toBe(false);
    expect(movable(r, 2)).toBe(true);
    expect(moveBoundary(r, 1, 10)).toBe(r);
  });

  it('nudges by a point against the next unlocked stage, down to 1%', () => {
    const r = [seg('a', 25, true), seg('b', 2), seg('c', 73)];
    expect(partnerOf(r, 2)).toBe(1);
    expect(nudge(r, 1, -1).map(s => s.pct)).toEqual([25, 1, 74]);
    expect(nudge(nudge(r, 1, -1), 1, -1).map(s => s.pct)).toEqual([25, 1, 74]);
    expect(nudge(r, 0, 1)).toBe(r);
  });

  it('adds a stage by splitting the selected one, else the biggest', () => {
    const r = [seg('a', 25), seg('b', 40), seg('c', 35)];
    expect(splitStage(r, 'New', 'x').map(s => [s.id, s.pct])).toEqual([['a', 25], ['b', 20], ['x', 20], ['c', 35]]);
    expect(splitStage(r, 'New', 'x', 0).map(s => [s.id, s.pct])).toEqual([['a', 13], ['x', 12], ['b', 40], ['c', 35]]);
    expect(splitStage([], 'First', 'x')).toEqual([seg('x', 100, false, 'First')]);
  });

  it('gives a removed stage to the one before it', () => {
    const r = [seg('a', 25, true), seg('b', 40), seg('c', 35)];
    expect(removeStage(r, 'c').map(s => [s.id, s.pct])).toEqual([['a', 25], ['b', 75]]);
    expect(removeStage(r, 'b').map(s => [s.id, s.pct])).toEqual([['a', 25], ['c', 75]]);
    expect(removeStage(r, 'a')).toBe(r);
  });
});

describe('starting splits', () => {
  it('spreads whole numbers that add up', () => {
    expect(spread(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(spread(62.5, [1, 1])).toEqual([31, 31.5]);
  });
  it('even and front-loaded reshape the stages there are, around what is locked', () => {
    const r = [seg('a', 25, true), seg('b', 40), seg('c', 35)];
    expect(reshape(r, 'even', undefined, newId).map(s => [s.id, s.pct])).toEqual([['a', 25], ['b', 38], ['c', 37]]);
    const f = reshape([seg('a', 25), seg('b', 25), seg('c', 25), seg('d', 25)], 'front', undefined, newId).map(s => s.pct);
    expect(f[0]).toBeGreaterThan(f[1]); expect(f[2]).toBeGreaterThan(f[3]); expect(f.reduce((s, v) => s + v, 0)).toBe(100);
  });
  it('the studio default skips the stages already billed', () => {
    const studio = [{ name: 'Sign-up', pct: 25 }, { name: 'Layouts', pct: 40 }, { name: 'GFC', pct: 35 }];
    const r = [seg('a', 25, true, 'Sign-up'), seg('b', 75, false, 'Layouts')];
    const out = reshape(r, 'studio', studio, newId);
    expect(out.map(s => [s.name, s.pct])).toEqual([['Sign-up', 25], ['Layouts', 40], ['GFC', 35]]);
    expect(out[1].id).toBe('b');
  });
});

describe('drawing', () => {
  it('draws a small stage wider so it can be grabbed, and the rest still fill the ring', () => {
    const w = drawnWidths([2, 49, 49]);
    expect(w[0]).toBe(RING_MIN_DRAWN);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
  });
});

describe('the schedule it saves', () => {
  const taxable = { design: 100000, execution: 1000000 };
  const current: any[] = [
    { id: 'd1', type: 'design', name: 'Sign-up', percentage: 25, status: 'paid' },
    { id: 'd2', type: 'design', name: 'Layouts', percentage: 0, isFixedAmount: true, fixedAmount: 75000, date: '2026-12-01' },
    { id: 'e1', type: 'execution', name: 'Material', percentage: 100 },
  ];
  it('keeps what did not move, bills what moved by percent and fills in a new stage', () => {
    const out = milestonesFromRings({
      design: [seg('d1', 25, true, 'Sign-up'), seg('d2', 75, false, 'Layouts')],
      execution: [seg('e1', 60, false, 'Material'), seg('x', 40, false, 'Handover')],
    }, current, taxable, newId);
    expect(out[0]).toBe(current[0]);
    expect(out[1]).toBe(current[1]);
    expect(out[2]).toMatchObject({ id: 'e1', percentage: 60, isFixedAmount: false });
    expect(out[3]).toMatchObject({ id: 'x', type: 'execution', name: 'Handover', percentage: 40, status: 'pending', isHandoverAdvance: true, trigger: 'On completion of all work' });
    expect(out[3].subSteps!.length).toBeGreaterThan(0);
  });
});
