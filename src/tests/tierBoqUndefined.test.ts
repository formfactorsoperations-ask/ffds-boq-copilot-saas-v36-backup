/*
  A BOQ line with an undefined field reaches Firestore without it.

  Firestore refuses a document holding undefined, and lines made by the
  standard templates carry several, so every new project's lines failed to be
  written to projects/{id}/tierBoq (services/dbService writeTierBoqs, lib/withoutUndefined).
*/
import { describe, it, expect } from 'vitest';



import { withoutUndefined } from '../../lib/withoutUndefined';

describe('withoutUndefined', () => {
  it('leaves out undefined fields at any depth and keeps everything else', () => {
    const line = { id: 'l1', bankId: 'wardrobe', qty: 40, roomId: undefined, rationale: undefined, place: { x: 1, y: undefined }, optional: false, note: null };
    const out = withoutUndefined([line]);
    expect(out).toEqual([{ id: 'l1', bankId: 'wardrobe', qty: 40, place: { x: 1 }, optional: false, note: null }]);
    expect(JSON.stringify(out)).not.toContain('undefined');
    expect(Object.keys(out[0])).not.toContain('roomId');
  });

  it('turns a hole in an array into null, so the elements after it keep their places', () => {
    expect(withoutUndefined({ tags: ['a', undefined, 'c'] })).toEqual({ tags: ['a', null, 'c'] });
  });

  it('does not touch the lines it was given', () => {
    const line: any = { id: 'l1', roomId: undefined };
    withoutUndefined([line]);
    expect('roomId' in line).toBe(true);
  });
});
