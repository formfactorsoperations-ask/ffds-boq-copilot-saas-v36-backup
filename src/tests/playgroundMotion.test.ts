/*
  What an edit in the BOQ Playground shows (PR 7, lib/playground/motion.ts),
  as the approved mockup shows it.
*/
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { freshOf, popWorth, popText } from '../../lib/playground/motion';

const P = (id: string, room: string, extra: any = {}): any => ({ id, bankId: 'w', qty: 40, roomId: room, calcLength: 6, calcWidth: 7, sizeUnit: 'ft', place: { x: 1, y: 1, rot: 0, depthFt: 2 }, ...extra });
const L = (id: string, room: string, extra: any = {}): any => ({ id, bankId: 'paint', qty: 300, roomId: room, ...extra });

describe('what an edit shows', () => {
  it('a piece added: its line prints in, it drops, its room glows, the price floats from it', () => {
    const a = [L('l1', 'Bedroom')];
    const f = freshOf(a, [...a, P('p1', 'Bedroom')]);
    expect([...f.flash]).toEqual(['p1']);
    expect([...f.drop]).toEqual([['p1', 0]]);
    expect(f.glow).toBe('Bedroom');
    expect(f.pop).toBe('p1');
  });

  it('a kit: every line prints, the pieces drop one after another, the first one’s room glows, nothing floats', () => {
    const f = freshOf([], [P('a', 'Bath 1'), L('b', 'Bath 1'), P('c', 'Bath 2')]);
    expect([...f.flash]).toEqual(['a', 'b', 'c']);
    expect([...f.drop]).toEqual([['a', 0], ['c', 1]]);
    expect(f.glow).toBe('Bath 1');
    expect(f.pop).toBeNull();
  });

  it('a line that is not drawn prints in, and nothing drops or glows', () => {
    const f = freshOf([], [L('l1', 'Bedroom')]);
    expect([...f.flash]).toEqual(['l1']);
    expect(f.drop.size).toBe(0);
    expect(f.glow).toBeNull();
    expect(f.pop).toBeNull();
  });

  it('a piece moved into another room: that room glows; moved within its room, nothing', () => {
    const p = P('p1', 'Bedroom');
    expect(freshOf([p], [{ ...p, roomId: 'Kitchen', place: { ...p.place, x: 14 } }]).glow).toBe('Kitchen');
    const still = freshOf([p], [{ ...p, place: { ...p.place, x: 2 } }]);
    expect(still.glow).toBeNull();
    expect(still.pop).toBeNull();
    expect(still.flash.size).toBe(0);
  });

  it('a piece resized or given another finish floats its price; a line not drawn does not', () => {
    const p = P('p1', 'Bedroom');
    expect(freshOf([p], [{ ...p, calcLength: 8, qty: 56 }]).pop).toBe('p1');
    expect(freshOf([p], [{ ...p, materialSpecs: { carcass: { mat: 'ply-bwp', v: 2 } } }]).pop).toBe('p1');
    const l = L('l1', 'Bedroom');
    expect(freshOf([l], [{ ...l, qty: 320 }]).pop).toBeNull();
  });

  it('the tag says the change as the mockup writes it, and only a rupee or more', () => {
    expect(popText(124000)).toBe('+₹1,24,000');
    expect(popText(-3000)).toBe('−₹3,000');
    expect(popWorth(0.4)).toBe(false);
    expect(popWorth(100)).toBe(true);
  });
});

describe('the Playground’s motion', () => {
  it('the Playground’s own keyframes all stop under reduced motion', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../components/playground/playground.css'), 'utf8');
    const frames = [...css.matchAll(/@keyframes ([a-z-]+)/g)].map(m => m[1]);
    expect(frames).toEqual(['pg-slide', 'pg-drop', 'pg-glow', 'pg-tag', 'pg-print', 'pg-ripple', 'pg-beckon']);
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    frames.forEach(f => expect(reduced).toContain(`.${f}`));
  });
});
