/*
  A work added to a room is measured from that room, and says how.

  The library's + used to add a work to the first room with a quantity of one.
  Dropped on a room (or added to the room in hand), wall tiles now come to the
  room's walls to 7′ less its doors, a floor to the floor, and so on.
*/
import { describe, it, expect } from 'vitest';
import { measureWork, workLine } from '../../lib/playground/works';
import { civilTypeOf } from '../../lib/playground/civil';
import type { Item, Room } from '../../types';

const item = (name: string, unit = 'sq ft', cat = 'Civil'): Item => ({ id: name, name, cat, unit, specs: '', materials: 100, labor: 50, margin: 20 } as Item);
// A 5′ × 8′ bathroom with one door, and a 12′ × 10′ bedroom, both 10′ high.
const bath = { name: 'Master Bathroom', size: 40, unit: 'sq ft', plan: { x: 0, y: 0, w: 5, h: 8 }, doors: 1, height: 10 } as Room;
const bed = { name: 'Master Bedroom', size: 120, unit: 'sq ft', plan: { x: 6, y: 0, w: 12, h: 10 }, doors: 1, height: 10 } as Room;
let n = 0; const newId = () => `w${++n}`;

describe('what a work is', () => {
  it('reads the studio’s own names', () => {
    expect(civilTypeOf(item('DEMOLISH AND INSTALL - WALL TILES'))).toBe('walls7');
    expect(civilTypeOf(item('DEMOLISH AND INSTALL - FLOORING TILES - DRY AREA'))).toBe('floor');
    expect(civilTypeOf(item('Waterproofing'))).toBe('waterproof');
    expect(civilTypeOf(item('Plumbing point', 'nos', 'Plumbing'))).toBeNull();
    expect(civilTypeOf(item('Tiles (wall & flooring) (as actuals)', 'lumpsum'))).toBeNull();
  });
});

describe('a work measured from its room', () => {
  it('wall tiles: the walls to 7′, less a door', () => {
    // (5 + 8) × 2 = 26′ of wall × 7′ = 182, less 21.
    expect(measureWork(item('DEMOLISH AND INSTALL - WALL TILES'), bath)).toMatchObject({ qty: 161, civil: { type: 'walls7' } });
    expect(measureWork(item('DEMOLISH AND INSTALL - WALL TILES'), bath)!.how).toMatch(/of wall × 7′, less 1 door/);
    // The same item in a bigger room comes to more: (12 + 10) × 2 × 7 − 21.
    expect(measureWork(item('DEMOLISH AND INSTALL - WALL TILES'), bed)!.qty).toBe(287);
  });

  it('a floor: the room’s floor', () => {
    expect(measureWork(item('DEMOLISH AND INSTALL - FLOORING TILES - DRY AREA'), bed)).toMatchObject({ qty: 120, civil: { type: 'floor' } });
  });

  it('waterproofing: the floor and a 1′ upstand', () => {
    expect(measureWork(item('Waterproofing'), bath)).toMatchObject({ qty: 66, civil: { type: 'waterproof' } });
  });

  it('wall painting to the ceiling less a door; ceiling painting and a false ceiling, the ceiling', () => {
    expect(measureWork(item('Interior painting', 'sq ft', 'Painting'), bed)!.qty).toBe(44 * 10 - 21);
    expect(measureWork(item('Interior ceiling painting', 'sq ft', 'Painting'), bed)!.qty).toBe(120);
    expect(measureWork(item('POP false ceiling', 'sq ft', 'Functional'), bed)).toMatchObject({ qty: 120 });
    expect(measureWork(item('POP false ceiling', 'sq ft', 'Functional'), bed)!.civil).toBeUndefined();
  });

  it('skirting round the walls less a door; another running item, round the walls', () => {
    expect(measureWork(item('Skirting', 'rft'), bed)!.qty).toBe(41);
    expect(measureWork(item('Copper piping', 'rft', 'HVAC'), bed)!.qty).toBe(44);
  });

  it('a counted item or a lump sum is one, whatever the room', () => {
    expect(measureWork(item('Plumbing point', 'nos', 'Plumbing'), bath)).toMatchObject({ qty: 1 });
    expect(measureWork(item('Bathroom BBC', 'lumpsum'), undefined)).toMatchObject({ qty: 1 });
  });

  it('cannot be measured in a room with no size', () => {
    expect(measureWork(item('Waterproofing'), { name: 'Store', size: 0, unit: 'sq ft' } as Room)).toBeNull();
  });
});

describe('the line a work makes', () => {
  it('carries the room, the measured quantity and how', () => {
    const r = workLine(item('DEMOLISH AND INSTALL - WALL TILES'), bath, [], newId) as any;
    expect(r.line).toMatchObject({ roomId: 'Master Bathroom', qty: 161, civil: { type: 'walls7' } });
    expect(r.how).toMatch(/less 1 door/);
  });

  it('a room takes each civil work once, and says which line has it', () => {
    const first = (workLine(item('DEMOLISH AND INSTALL - WALL TILES'), bath, [], newId) as any).line;
    const again = workLine(item('DEMOLISH AND INSTALL - WALL TILES'), bath, [first], newId) as any;
    expect(again.problem).toMatch(/already has this work/);
    expect(again.existing).toBe(first.id);
    // Another room is free to take it.
    expect('line' in workLine(item('DEMOLISH AND INSTALL - WALL TILES'), bed, [first], newId)).toBe(true);
  });

  it('a counted work can be added again', () => {
    const p = item('Plumbing point', 'nos', 'Plumbing');
    const first = (workLine(p, bath, [], newId) as any).line;
    expect('line' in workLine(p, bath, [first], newId)).toBe(true);
  });

  it('needs a room', () => {
    expect((workLine(item('Waterproofing'), undefined, [], newId) as any).problem).toMatch(/inside a room/);
  });
});
