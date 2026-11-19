import React, { useEffect, useState } from 'react';
import { DoorOpen, Merge, Plus, Split } from 'lucide-react';
import { Button, Chip, Segmented, LABEL, INPUT } from '../ui/kit';
import type { ProjectSchedule, ScheduleTask } from '../../types';
import {
  canSplitByRooms, mergeRooms, roomTasksOf, splitByRooms, stageIdOf, RoomSplitMode,
} from '../../lib/roomSchedule';

/*
  Room-wise work, in the Timeline's stage editor.

  A renovation runs room by room while the family lives in the rest of the home,
  so a stage can be given a room, or split into one bar per room: in sequence
  (one crew moving room to room, the stage's days shared) or together (every
  room at once). A room bar follows the same room in the stage before it, so
  the kitchen's plumbing starts when the kitchen's civil is done. See
  lib/roomSchedule.ts.
*/
interface Props {
  schedule: ProjectSchedule;
  task: ScheduleTask;
  /** The project's rooms, from its room list and BOQ. */
  rooms: string[];
  onChange: (next: ProjectSchedule) => void;
}

export default function RoomWorkField({ schedule, task, rooms, onChange }: Props) {
  const [extra, setExtra] = useState<string[]>([]);
  const all = Array.from(new Set([...rooms, ...extra]));
  const [picked, setPicked] = useState<string[]>(rooms);
  const [mode, setMode] = useState<RoomSplitMode>('sequence');
  const [typed, setTyped] = useState('');

  // A different stage starts from every room again.
  useEffect(() => { setPicked(rooms); setExtra([]); setTyped(''); }, [task.id, rooms.join('|')]);

  if (task.kind !== 'execution' && task.kind !== 'procurement') return null;

  const setRoom = (room: string) => onChange({
    ...schedule,
    tasks: schedule.tasks.map((t) => (t.id === task.id ? { ...t, room: room || undefined } : t)),
  });

  const siblings = roomTasksOf(schedule.tasks, stageIdOf(task.id));
  if (siblings.length > 0) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <div className={LABEL}>Room</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="brand"><DoorOpen className="w-3 h-3" aria-hidden />{task.room}</Chip>
          <span className="text-[11px] text-slate-500">One of {siblings.length} rooms in this stage.</span>
        </div>
        <Button size="sm" variant="quiet" icon={Merge} onClick={() => onChange(mergeRooms(schedule, task.id))}>
          Put the rooms back into one stage
        </Button>
      </div>
    );
  }

  const add = () => {
    const name = typed.trim();
    if (!name) return;
    if (!all.some((r) => r.toLowerCase() === name.toLowerCase())) setExtra((x) => [...x, name]);
    setPicked((p) => (p.some((r) => r.toLowerCase() === name.toLowerCase()) ? p : [...p, name]));
    setTyped('');
  };
  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const chosen = all.filter((r) => picked.includes(r));
  const splittable = canSplitByRooms(task);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div>
        <label className={`block ${LABEL} mb-1.5`} htmlFor={`room-${task.id}`}>Room</label>
        <select id={`room-${task.id}`} value={task.room || ''} onChange={(e) => setRoom(e.target.value)} className={INPUT}>
          <option value="">Whole home</option>
          {Array.from(new Set([...(task.room ? [task.room] : []), ...all])).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {splittable && (
        <div className="space-y-2">
          <div className={LABEL}>Room by room</div>
          <p className="text-[11px] text-slate-500">
            For a renovation: run this stage one room at a time, or in every room at once.
            Each room follows the same room in the stage before it.
          </p>
          {all.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rooms to split into">
              {all.map((r) => {
                const on = picked.includes(r);
                return (
                  <button key={r} type="button" aria-pressed={on} onClick={() => toggle(r)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      on ? 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}>
                    {r}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-1.5">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Add a room"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              className={INPUT} aria-label="Add a room" />
            <Button size="sm" icon={Plus} onClick={add} disabled={!typed.trim()}>Add</Button>
          </div>
          <Segmented<RoomSplitMode>
            size="sm"
            label="How the rooms run"
            value={mode}
            onChange={setMode}
            options={[{ id: 'sequence', label: 'One room at a time' }, { id: 'together', label: 'All rooms together' }]}
          />
          <p className="text-[11px] text-slate-500">
            {mode === 'sequence'
              ? `About ${Math.max(1, Math.round(task.workDays / Math.max(1, chosen.length)))} working days a room, so the stage still takes ${task.workDays}.`
              : `Each room takes the stage's ${task.workDays} working days, side by side.`}
          </p>
          <Button size="sm" variant="primary" icon={Split} disabled={chosen.length < 2}
            onClick={() => onChange(splitByRooms(schedule, task.id, chosen, mode))}>
            {chosen.length < 2 ? 'Pick two rooms or more' : `Split into ${chosen.length} rooms`}
          </Button>
        </div>
      )}
      {!splittable && !task.room && (task.actualStartISO || task.status === 'completed') && (
        <p className="text-[11px] text-slate-500">This stage has started, so it stays as one bar.</p>
      )}
    </div>
  );
}
