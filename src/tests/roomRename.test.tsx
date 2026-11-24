/*
  A room renamed in the Brief, carried into the BOQ (lib/playground/roomRename).
  The owner renamed "M. Bedroom" to "Master Bedroom" in the Brief and the BOQ
  showed both: the lines stayed under the old name.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProjectContextCard from '../../components/ProjectContextCard';
import { OrgProvider } from '../../contexts/OrgContext';
import { moveRoomLines, renameRoomInTiers, renameRoomInContext, renameProblem } from '../../lib/playground/roomRename';

const lines = (): any[] => [
  { id: 'a', bankId: 'w', qty: 40, roomId: 'M. Bedroom' },
  { id: 'b', bankId: 'p', qty: 300, roomId: 'Kitchen' },
  { id: 'c', bankId: 'e', qty: 30, roomId: 'Functional', byRoom: { basis: 'points', client: 'flat', rooms: { 'M. Bedroom': { qty: 8 }, Kitchen: { on: false } } } },
];

describe('the BOQ follows the rename', () => {
  it('moves the room’s lines and a whole-flat line’s share in it', () => {
    const out = moveRoomLines(lines(), 'M. Bedroom', ' Master Bedroom ');
    expect(out.map(l => l.roomId)).toEqual(['Master Bedroom', 'Kitchen', 'Functional']);
    expect(out[2].byRoom.rooms).toEqual({ Kitchen: { on: false }, 'Master Bedroom': { qty: 8 } });
  });

  it('keeps every line as it was when nothing is in that room, or the name is the same or empty', () => {
    const l = lines();
    expect(moveRoomLines(l, 'Study', 'Library')).toBe(l);
    expect(moveRoomLines(l, 'M. Bedroom', 'M. Bedroom')).toBe(l);
    expect(moveRoomLines(l, 'M. Bedroom', '  ')).toBe(l);
    const out = moveRoomLines(l, 'M. Bedroom', 'Master Bedroom');
    expect(out[1]).toBe(l[1]);
  });

  it('renames in every option but the one the client signed', () => {
    const tiers: any[] = [{ id: 't1', boq: lines() }, { id: 't2', boq: lines() }, { id: 't3', boq: [{ id: 'x', bankId: 'w', qty: 1, roomId: 'Kitchen' }] }];
    const out = renameRoomInTiers(tiers, 'M. Bedroom', 'Master Bedroom', 't2');
    expect(out[0].boq[0].roomId).toBe('Master Bedroom');
    expect(out[1]).toBe(tiers[1]);
    expect(out[2]).toBe(tiers[2]);
  });

  it('an offer off the room names it by its new name', () => {
    const ctx: any = { financials: { discounts: [
      { id: 'd1', name: '10% off the M. Bedroom', type: 'fixed', value: 5000, target: 'execution', basis: { kind: 'room-percent', room: 'M. Bedroom', percent: 10, tierId: 't1' } },
      { id: 'd2', name: 'Goodwill', type: 'fixed', value: 2000, target: 'execution' },
    ] } };
    const out = renameRoomInContext(ctx, 'M. Bedroom', 'Master Bedroom');
    expect(out.financials!.discounts![0]).toMatchObject({ name: '10% off the Master Bedroom', basis: { room: 'Master Bedroom' } });
    expect(out.financials!.discounts![1]).toBe(ctx.financials.discounts[1]);
    expect(renameRoomInContext(ctx, 'Study', 'Library')).toBe(ctx);
  });

  it('a name must be a room’s own: not empty, not a scope, not another room’s', () => {
    const names = ['M. Bedroom', 'Kitchen'];
    expect(renameProblem(names, 'M. Bedroom', 'Master Bedroom')).toBeNull();
    expect(renameProblem(names, 'M. Bedroom', 'm. bedroom')).toBeNull();
    expect(renameProblem(names, 'M. Bedroom', ' ')).toBe('A room needs a name.');
    expect(renameProblem(names, 'M. Bedroom', 'kitchen')).toBe('There is already a room called kitchen.');
    expect(renameProblem(names, 'M. Bedroom', 'Civil')).toMatch(/scope of the whole flat/);
  });
});

describe('the Brief renames a room once its name is done', () => {
  const Wrapper = ({ onRename }: { onRename: (from: string, to: string) => void }) => {
    const [ctx, setCtx] = useState<any>({ area: 900, rooms: [{ name: 'M. Bedroom', size: 136, unit: 'sq ft' }, { name: 'Kitchen', size: 80, unit: 'sq ft' }] });
    return (
      <OrgProvider>
        <ProjectContextCard projectContext={ctx} setProjectContext={setCtx} aiStrategy="balanced" only="rooms" onRenameRoom={onRename} />
        <div data-testid="names">{ctx.rooms.map((r: any) => r.name).join('|')}</div>
      </OrgProvider>
    );
  };
  const nameField = (v: string) => screen.getByDisplayValue(v) as HTMLInputElement;

  it('on leaving the field: one rename, from the old name to the new, not one per letter', () => {
    const onRename = vi.fn();
    render(<Wrapper onRename={onRename} />);
    const f = nameField('M. Bedroom');
    fireEvent.change(f, { target: { value: 'Master Bed' } });
    fireEvent.change(f, { target: { value: 'Master Bedroom ' } });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByTestId('names').textContent).toBe('M. Bedroom|Kitchen');
    fireEvent.blur(f);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('M. Bedroom', 'Master Bedroom');
    expect(screen.getByTestId('names').textContent).toBe('Master Bedroom|Kitchen');
  });

  it('another room’s name is not taken: the field goes back and says why', () => {
    const onRename = vi.fn();
    render(<Wrapper onRename={onRename} />);
    const f = nameField('M. Bedroom');
    fireEvent.change(f, { target: { value: 'Kitchen' } });
    fireEvent.blur(f);
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('There is already a room called Kitchen.');
    expect(f.value).toBe('M. Bedroom');
  });

  it('Escape leaves the name as it was', () => {
    const onRename = vi.fn();
    render(<Wrapper onRename={onRename} />);
    const f = nameField('M. Bedroom');
    fireEvent.change(f, { target: { value: 'Guest' } });
    fireEvent.keyDown(f, { key: 'Escape' });
    fireEvent.blur(f);
    expect(onRename).not.toHaveBeenCalled();
    expect(f.value).toBe('M. Bedroom');
  });
});
