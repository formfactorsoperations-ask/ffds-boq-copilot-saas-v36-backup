/*
  A line already in the BOQ: how it is supplied (lib/playground/supply
  withLineSupply), and moved to another room (lib/playground/roomRename moveLinesTo).
*/
import { describe, it, expect } from 'vitest';
import { withLineSupply, actualsByName } from '../../lib/playground/supply';
import { moveLinesTo, movedWords } from '../../lib/playground/roomRename';

const L = (extra: any = {}): any => ({ id: 'a', bankId: 'w', qty: 1, roomId: 'Bedroom', ...extra });

describe('how a line is supplied', () => {
  it('at actuals, by the client, or back in the price; the old flag goes', () => {
    expect(withLineSupply(L({ asActuals: true }), 'client')).toEqual(L({ boqStatus: 'client_procured' }));
    expect(withLineSupply(L(), 'actuals').boqStatus).toBe('as_actuals');
    expect(withLineSupply(L({ boqStatus: 'as_actuals', asActuals: true }), null)).toEqual(L());
  });

  it('back in the price leaves another status as it was', () => {
    expect(withLineSupply(L({ boqStatus: 'provisional_sum' }), null).boqStatus).toBe('provisional_sum');
  });

  it('a name that says actuals keeps it at actuals', () => {
    const bank = new Map<string, any>([['w', { id: 'w', name: 'Gas piping (as actuals)' }], ['x', { id: 'x', name: 'Wardrobe' }]]);
    expect(actualsByName(L(), bank)).toBe(true);
    expect(actualsByName(L({ bankId: 'x' }), bank)).toBe(false);
  });
});

describe('lines moved to another room', () => {
  it('moves them; a piece on the plan comes off it; a shared or civil line stays', () => {
    const boq = [
      L({ id: 'a' }),
      L({ id: 'p', place: { x: 1, y: 1, rot: 0, depthFt: 2 } }),
      L({ id: 's', roomId: 'Functional', byRoom: { basis: 'points', client: 'flat', rooms: {} } }),
      L({ id: 'c', civil: { type: 'floor' } }),
      L({ id: 'k', roomId: 'Kitchen' }),
    ];
    const r = moveLinesTo(boq, ['a', 'p', 's', 'c'], 'Kitchen');
    expect(r.boq.map(l => l.roomId)).toEqual(['Kitchen', 'Kitchen', 'Functional', 'Bedroom', 'Kitchen']);
    expect(r.boq[1].place).toBeUndefined();
    expect(r.boq[4]).toBe(boq[4]);
    expect(r).toMatchObject({ moved: 2, offPlan: 1, kept: 2 });
    expect(movedWords(r, 'Kitchen')).toBe('2 lines moved to Kitchen. 1 of them came off the plan: place them again from their panels. 2 stayed where they were: a whole-flat or civil line follows its rooms. Undo puts them back.');
  });

  it('nothing to move: the same lines back', () => {
    const boq = [L()];
    expect(moveLinesTo(boq, ['a'], 'Bedroom').boq).toBe(boq);
    expect(moveLinesTo(boq, ['a'], ' ').boq).toBe(boq);
  });
});
