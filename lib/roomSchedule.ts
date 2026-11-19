/*
  Room-wise work on the programme.

  A renovation is rarely done as one flat-wide pass. The family lives in part
  of the home, so civil and demolition go room by room, and each room's
  plumbing, carpentry and paint follow its own civil rather than waiting for
  the whole flat. The schedule held one bar per trade, so none of that could
  be written down.

  `splitByRooms` turns one stage into one bar per room:

    - in sequence, one room at a time: the crew moves from room to room, the
      stage's days shared between them, so the stage ends when it did;
    - or together, every room at once: each room keeps the stage's days.

  A room bar waits for the same room's bar in the stage before it, where that
  stage was split too: Kitchen plumbing follows Kitchen civil, not the last
  room's. Stages after it wait for the last room (in sequence), for every room
  (together), or for their own room when they are split as well.

  `mergeRooms` puts a split stage back together.

  Room bars carry the stage's id with the room after a '~', so the stage they
  came from can be found again without a field of its own.
*/
import type { ProjectSchedule, ScheduleTask } from '../types';

export type RoomSplitMode = 'sequence' | 'together';

const SEP = '~';

const slug = (room: string) =>
  room.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';

/** The stage a room bar was split from, or the task's own id. */
export const stageIdOf = (id: string): string => (id.includes(SEP) ? id.slice(0, id.indexOf(SEP)) : id);

/** The room bars of a split stage, in programme order. */
export const roomTasksOf = (tasks: ScheduleTask[], stageId: string): ScheduleTask[] =>
  tasks.filter((t) => t.id.startsWith(stageId + SEP));

/** Whether a task can be split: site or procurement work, not started, not already a room bar. */
export function canSplitByRooms(t: ScheduleTask | undefined | null): boolean {
  return !!t
    && (t.kind === 'execution' || t.kind === 'procurement')
    && !t.id.includes(SEP)
    && !t.room
    && !t.actualStartISO
    && t.status !== 'completed';
}

/**
 * The room names to offer: the project's rooms, then any room the BOQ names
 * that the room list does not, in order and without repeats.
 */
export function projectRoomNames(ctx: any, boq: Array<{ room?: string; roomName?: string }> = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (n: unknown) => {
    const name = typeof n === 'string' ? n.trim() : '';
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push(name);
  };
  (Array.isArray(ctx?.rooms) ? ctx.rooms : []).forEach((r: any) => add(r?.name));
  boq.forEach((i) => add(i?.room || i?.roomName));
  return out;
}

/** The same room's bar in a split stage, if it has one. */
function sameRoomIn(tasks: ScheduleTask[], depId: string, room: string): string | null {
  const stage = stageIdOf(depId);
  const hit = roomTasksOf(tasks, stage).find((t) => (t.room || '').toLowerCase() === room.toLowerCase());
  return hit ? hit.id : null;
}

export function splitByRooms(
  schedule: ProjectSchedule,
  taskId: string,
  rooms: string[],
  mode: RoomSplitMode,
): ProjectSchedule {
  const tasks = schedule.tasks || [];
  const at = tasks.findIndex((t) => t.id === taskId);
  const base = tasks[at];
  const names = Array.from(new Set(rooms.map((r) => r.trim()).filter(Boolean)));
  if (at < 0 || !canSplitByRooms(base) || names.length < 2) return schedule;

  const used = new Set(tasks.map((t) => t.id));
  const ids = names.map((r) => {
    let id = `${base.id}${SEP}${slug(r)}`;
    for (let n = 2; used.has(id); n++) id = `${base.id}${SEP}${slug(r)}-${n}`;
    used.add(id);
    return id;
  });

  // In sequence the stage's days are shared, so it still ends when it did.
  const days = mode === 'sequence'
    ? Math.max(1, Math.round(base.workDays / names.length))
    : Math.max(1, base.workDays);

  const roomTasks: ScheduleTask[] = names.map((room, i) => {
    /*
      Each predecessor, swapped for its own room's bar where it was split by
      room. In sequence, later rooms follow the room before -- which already
      waits for the stage's own predecessors -- so they keep only the
      same-room links, and the previous room comes first: it is the one the
      stage editor shows.
    */
    const chained = mode === 'sequence' && i > 0;
    const fromStage = (base.dependencies || [])
      .map((d) => sameRoomIn(tasks, d, room) || (chained ? null : d))
      .filter((d): d is string => !!d);
    const chain = chained ? [ids[i - 1]] : [];
    return {
      id: ids[i],
      // Room first: the stage list truncates long titles, and the room is what tells the bars apart.
      title: `${room} · ${base.title}`,
      kind: base.kind,
      trade: base.trade,
      room,
      bundleId: base.bundleId,
      dependencies: Array.from(new Set([...chain, ...fromStage])),
      workDays: days,
      notBeforeISO: mode === 'sequence' && i > 0 ? undefined : base.notBeforeISO,
      status: 'pending',
      gates: base.gates,
      leadTimeDays: base.leadTimeDays,
      note: base.note,
      earlyStart: base.earlyStart,
      // Overlap is measured against the stage before; the first room keeps it.
      overlapDays: i === 0 ? base.overlapDays : undefined,
    };
  });

  const last = ids[ids.length - 1];
  const rest = tasks.map((t) => {
    if (t.id === taskId || !(t.dependencies || []).includes(taskId)) return t;
    const own = t.room ? roomTasks.find((r) => r.room!.toLowerCase() === t.room!.toLowerCase())?.id : undefined;
    const into = own ? [own] : mode === 'sequence' ? [last] : ids;
    const deps = (t.dependencies || []).flatMap((d) => (d === taskId ? into : [d]));
    return { ...t, dependencies: Array.from(new Set(deps)) };
  });

  rest.splice(at, 1, ...roomTasks);
  return { ...schedule, tasks: rest };
}

/** Put a split stage back into one bar. */
export function mergeRooms(schedule: ProjectSchedule, anyRoomTaskId: string): ProjectSchedule {
  const tasks = schedule.tasks || [];
  const stage = stageIdOf(anyRoomTaskId);
  const members = roomTasksOf(tasks, stage);
  if (members.length === 0) return schedule;
  const memberIds = new Set(members.map((m) => m.id));
  const first = members[0];

  // Chained room to room, the stage is as long as the rooms added up; side by side, as the longest.
  const chained = members.slice(1).every((m, i) => (m.dependencies || []).includes(members[i].id));
  const workDays = chained
    ? members.reduce((n, m) => n + m.workDays, 0)
    : Math.max(...members.map((m) => m.workDays));

  const outside = Array.from(new Set(members.flatMap((m) => (m.dependencies || []).filter((d) => !memberIds.has(d)))));
  const merged: ScheduleTask = {
    id: stage,
    title: first.room && first.title.startsWith(`${first.room} · `)
      ? first.title.slice(first.room.length + 3)
      : first.title,
    kind: first.kind,
    trade: first.trade,
    bundleId: first.bundleId,
    dependencies: outside,
    workDays,
    notBeforeISO: first.notBeforeISO,
    status: 'pending',
    gates: first.gates,
    leadTimeDays: first.leadTimeDays,
    note: first.note,
    earlyStart: first.earlyStart,
    overlapDays: first.overlapDays,
  };

  const at = tasks.findIndex((t) => memberIds.has(t.id));
  const rest = tasks
    .filter((t) => !memberIds.has(t.id))
    .map((t) => {
      if (!(t.dependencies || []).some((d) => memberIds.has(d))) return t;
      const deps = (t.dependencies || []).map((d) => (memberIds.has(d) ? stage : d));
      return { ...t, dependencies: Array.from(new Set(deps)) };
    });
  rest.splice(at, 0, merged);
  return { ...schedule, tasks: rest };
}
