import { describe, it, expect } from 'vitest';
import { planScopeMigration, reassignmentFor, resolvedRoomId, roomChoice } from '../../lib/scopeMigration';
import { bucketForItem } from '../../lib/scopeBuckets';
import { BoqItem, Item, Room } from '../../types';

const rooms: Room[] = [{ name: 'Master Bedroom', size: 180, unit: 'sq ft' } as Room];
const roomNames = new Set(['Master Bedroom']);
const pelmet = { id: 'b1', name: 'AC Pelmet - all rooms', cat: 'Carpentry' } as Item;
const debris = { id: 'b2', name: 'Debris removal', cat: 'Site Services' } as Item;

describe('a scope picked by a person stays picked', () => {
  it('keeps carpentry in Functional once moved there by hand', () => {
    const line: BoqItem = { id: 'l1', bankId: 'b1', qty: 60, ...roomChoice('Functional') };
    expect(line.scopeChosen).toBe(true);
    expect(reassignmentFor(line, pelmet, roomNames)).toBeNull();
    expect(resolvedRoomId(line, pelmet, roomNames)).toBe('Functional');
    expect(planScopeMigration([line], [pelmet], rooms)).toEqual([]);
  });

  it('still normalises the spelling of a chosen scope', () => {
    const line: BoqItem = { id: 'l1', bankId: 'b1', qty: 1, roomId: 'FUNCTIONAL', scopeChosen: true };
    expect(reassignmentFor(line, pelmet, roomNames)).toMatchObject({ to: 'Functional', reason: 'Scope name normalised' });
  });

  it('still re-files a scope nobody chose', () => {
    const line: BoqItem = { id: 'l1', bankId: 'b2', qty: 1, roomId: 'Functional' };
    expect(reassignmentFor(line, debris, roomNames)).toMatchObject({ to: 'Others' });
  });

  it('clears the mark when a line goes to a room or back to unassigned', () => {
    expect(roomChoice('Master Bedroom')).toEqual({ roomId: 'Master Bedroom', scopeChosen: false });
    expect(roomChoice('Unassigned')).toEqual({ roomId: undefined, scopeChosen: false });
  });
});

describe('a category named after a scope', () => {
  it('goes to that scope, not Others', () => {
    expect(bucketForItem({ cat: 'Functional', name: 'Wiring' })).toBe('Functional');
    expect(bucketForItem({ cat: 'CIVIL', name: 'Tiling' })).toBe('Civil');
    const line: BoqItem = { id: 'l1', bankId: 'b3', qty: 1, roomId: 'Functional' };
    const imported = { id: 'b3', name: 'Wiring', cat: 'Functional' } as Item;
    expect(planScopeMigration([line], [imported], rooms)).toEqual([]);
  });
});
