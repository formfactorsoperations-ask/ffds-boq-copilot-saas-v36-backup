import { describe, it, expect } from 'vitest';
import { splitByRooms, mergeRooms, canSplitByRooms, projectRoomNames, roomTasksOf } from '../../lib/roomSchedule';
import { computeSchedule } from '../../lib/schedule';
import type { ProjectSchedule, ScheduleTask } from '../../types';

/* A renovation: civil, then plumbing, then carpentry, then handover. */
const task = (id: string, title: string, deps: string[], workDays: number, kind: ScheduleTask['kind'] = 'execution'): ScheduleTask =>
  ({ id, title, kind, trade: title, dependencies: deps, workDays, status: 'pending' });

const base: ProjectSchedule = {
  projectStartISO: '2027-01-04',
  tasks: [
    task('civil', 'Civil & Demolition', [], 12),
    task('plumb', 'Plumbing', ['civil'], 6),
    task('carp', 'Carpentry', ['plumb'], 10),
    { id: 'ms-handover', title: 'Handover', kind: 'milestone', dependencies: ['carp'], workDays: 0, status: 'pending' },
  ],
  holds: [],
} as any;

const rooms = ['Kitchen', 'Master Bedroom', 'Bath 2'];
const ends = (s: ProjectSchedule) => new Map(computeSchedule(s).tasks.map((t) => [t.id, t]));

describe('splitting a stage by room', () => {
  it('in sequence, one room after another in the same days', () => {
    const s = splitByRooms(base, 'civil', rooms, 'sequence');
    const civil = roomTasksOf(s.tasks, 'civil');
    expect(civil.map((t) => t.room)).toEqual(rooms);
    expect(civil.map((t) => t.workDays)).toEqual([4, 4, 4]);
    expect(civil[1].dependencies).toEqual([civil[0].id]);
    expect(civil[2].dependencies).toEqual([civil[1].id]);
    // Plumbing waits for the last room.
    expect(s.tasks.find((t) => t.id === 'plumb')!.dependencies).toEqual([civil[2].id]);
    const r = ends(s);
    expect(r.get(civil[1].id)!.startDay).toBe(r.get(civil[0].id)!.endDay + 1);
  });

  it('together, every room at once for the full stage', () => {
    const s = splitByRooms(base, 'civil', rooms, 'together');
    const civil = roomTasksOf(s.tasks, 'civil');
    expect(civil.every((t) => t.workDays === 12 && t.dependencies.length === 0)).toBe(true);
    expect(s.tasks.find((t) => t.id === 'plumb')!.dependencies).toEqual(civil.map((t) => t.id));
  });

  it("follows each room's own civil when the next trade is split too", () => {
    const s1 = splitByRooms(base, 'civil', rooms, 'sequence');
    const s2 = splitByRooms(s1, 'plumb', rooms, 'sequence');
    const plumb = roomTasksOf(s2.tasks, 'plumb');
    const civil = roomTasksOf(s2.tasks, 'civil');
    expect(plumb[0].dependencies).toEqual([civil[0].id]);
    expect(plumb[1].dependencies).toEqual([plumb[0].id, civil[1].id]);
    // So the kitchen's plumbing starts as soon as the kitchen's civil is done,
    // not after the whole flat's.
    const r = ends(s2);
    expect(r.get(plumb[0].id)!.startDay).toBe(r.get(civil[0].id)!.endDay + 1);
    expect(r.get(plumb[0].id)!.startDay).toBeLessThan(r.get(civil[2].id)!.endDay);
  });

  it('keeps handover last', () => {
    const s = splitByRooms(splitByRooms(base, 'civil', rooms, 'sequence'), 'carp', rooms, 'together');
    const r = ends(s);
    const last = Math.max(...[...r.values()].filter((t) => t.kind !== 'milestone').map((t) => t.endDay));
    expect(r.get('ms-handover')!.startDay).toBeGreaterThan(last);
  });

  it('will not split a started stage, a room bar or a milestone', () => {
    expect(canSplitByRooms({ ...base.tasks[0], actualStartISO: '2027-01-04' })).toBe(false);
    expect(canSplitByRooms(base.tasks[3])).toBe(false);
    const s = splitByRooms(base, 'civil', rooms, 'sequence');
    expect(canSplitByRooms(roomTasksOf(s.tasks, 'civil')[0])).toBe(false);
    expect(splitByRooms(base, 'civil', ['Kitchen'], 'sequence')).toBe(base);
  });
});

describe('merging the rooms back', () => {
  it('restores one stage with the rooms’ days and links', () => {
    const merged = mergeRooms(splitByRooms(base, 'civil', rooms, 'sequence'), 'civil~kitchen');
    expect(merged.tasks.map((t) => t.id)).toEqual(['civil', 'plumb', 'carp', 'ms-handover']);
    expect(merged.tasks[0]).toMatchObject({ title: 'Civil & Demolition', workDays: 12, dependencies: [] });
    expect(merged.tasks[1].dependencies).toEqual(['civil']);
  });

  it('takes the longest room when they ran together', () => {
    const merged = mergeRooms(splitByRooms(base, 'carp', rooms, 'together'), 'carp~bath-2');
    expect(merged.tasks.find((t) => t.id === 'carp')).toMatchObject({ workDays: 10, dependencies: ['plumb'] });
  });
});

describe('the rooms to offer', () => {
  it('lists the project rooms, then rooms only the BOQ names', () => {
    expect(projectRoomNames({ rooms: [{ name: 'Kitchen' }, { name: 'Living' }] }, [{ room: 'kitchen' }, { roomName: 'Balcony' }]))
      .toEqual(['Kitchen', 'Living', 'Balcony']);
  });
});
