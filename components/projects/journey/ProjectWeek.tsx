import React, { useState } from 'react';
import { STAGE } from '../../../lib/projectFolders';
import { rankOf, todayKey, weekDays, type JourneyRow } from '../../../lib/projectsJourney';
import { Chip, LABEL } from '../../ui/kit';
import { NextStepButton, ProjectPhoto } from './parts';

/*
  This week (DESIGN.md "Projects: journey, needs you, one list"): Monday to
  Saturday, each column the next steps due that day. Today is ringed in brand;
  a past day is hatched, with an Overdue chip when something is still on it.
  Drag a card to another day to move its due date (kept on the project).

  Steps that are on no day of this week wait in one strip above the columns,
  so none is left out: overdue from before Monday, not given a day yet, and
  due after Saturday. A card dragged from there to a day takes that day.
*/

const EDGE = { red: '#e11d48', gold: '#B8923A', brand: '#3D52A0' } as const;
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const Card: React.FC<{
  r: JourneyRow;
  nameOf: (email: string) => string;
  onOpen: (r: JourneyRow) => void;
  onDo: (r: JourneyRow) => void;
  small?: boolean;
}> = ({ r, nameOf, onOpen, onDo, small = false }) => {
  const who = r.designers[0];
  return (
    <article
      draggable
      data-testid={`week-card-${r.id}`}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpen(r)}
      className={cx('pj-wk-card bg-white border border-slate-200 rounded-xl hud-row-in', small ? 'p-2 w-[220px] shrink-0' : 'p-2.5 mb-2')}
      style={{ borderLeft: `4px solid ${EDGE[r.next!.tone]}` }}
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <ProjectPhoto row={r} className="w-[30px] h-[30px] rounded-[9px]" label={false} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{r.name}</p>
          <p className="text-[11px] text-slate-500 truncate">{[STAGE[r.stage].label, who ? nameOf(who).split(' ')[0] : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <p className={cx('font-bold text-slate-800 leading-snug', small ? 'text-xs mb-1.5 truncate' : 'text-sm mb-2')}>{r.action?.title || r.next!.label}</p>
      {!small && <NextStepButton row={r} label="Do it" onDo={onDo} />}
    </article>
  );
};

export default function ProjectWeek({ rows, nameOf, onOpen, onDo, onMove, now = Date.now() }: {
  /** Rows with a next step. */
  rows: JourneyRow[];
  nameOf: (email: string) => string;
  onOpen: (r: JourneyRow) => void;
  onDo: (r: JourneyRow) => void;
  /** A card dropped on a day: its step's new due day. */
  onMove: (r: JourneyRow, day: string) => void;
  now?: number;
}) {
  const [over, setOver] = useState<string | null>(null);
  const days = weekDays(now);
  const today = todayKey(now);
  const withStep = rows.filter((r) => r.next);
  const order = (a: JourneyRow, b: JourneyRow) => rankOf(a) - rankOf(b);
  const before = withStep.filter((r) => r.due && r.due.day < days[0]).sort(order);
  const undated = withStep.filter((r) => !r.due).sort(order);
  const later = withStep.filter((r) => r.due && r.due.day > days[5]).sort(order);

  const drop = (day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const r = withStep.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (r && r.due?.day !== day) onMove(r, day);
  };

  const off = [
    { key: 'before', label: 'Overdue from before Monday', rows: before },
    { key: 'none', label: 'No day yet', rows: undated },
    { key: 'later', label: 'After Saturday', rows: later },
  ].filter((g) => g.rows.length);

  return (
    <div className="space-y-3">
      {off.length > 0 && (
        <section aria-label="Not on a day this week" className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 hud-panel-in space-y-2.5">
          {off.map((g) => (
            <div key={g.key}>
              <p className={cx(LABEL, 'mb-1.5')}>{g.label} <span className="tabular-nums text-slate-400">{g.rows.length}</span></p>
              <div className="flex gap-2 overflow-x-auto pj-noscroll pb-0.5">
                {g.rows.map((r) => <Card key={r.id} r={r} nameOf={nameOf} onOpen={onOpen} onDo={onDo} small />)}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="pj-wk pj-noscroll">
        {days.map((day, i) => {
          const items = withStep.filter((r) => r.due?.day === day).sort(order);
          const past = day < today;
          const isToday = day === today;
          return (
            <section
              key={day}
              aria-label={`${WEEKDAY[i]} ${Number(day.slice(8))}`}
              data-testid={`day-${day}`}
              className={cx('pj-wk-col hud-panel-in', isToday && 'today', past && 'past', over === day && 'over')}
              style={{ animationDelay: `${i * 40}ms` }}
              onDragOver={(e) => { e.preventDefault(); if (over !== day) setOver(day); }}
              onDragLeave={() => setOver((o) => (o === day ? null : o))}
              onDrop={drop(day)}
            >
              <div className="flex items-baseline gap-2 px-1 pt-1 pb-3">
                <span className={LABEL}>{WEEKDAY[i]}</span>
                <b className="text-2xl font-bold text-slate-800 tracking-tight tabular-nums">{Number(day.slice(8))}</b>
                {isToday && <Chip tone="brand" className="ml-auto">Today</Chip>}
                {past && items.length > 0 && <Chip tone="bad" className="ml-auto">Overdue</Chip>}
              </div>
              {items.map((r) => <Card key={r.id} r={r} nameOf={nameOf} onOpen={onOpen} onDo={onDo} />)}
              {items.length === 0 && <p className="text-[11px] text-slate-500 px-1 py-2">Free</p>}
            </section>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">Drag a card to another day to reschedule it.</p>
    </div>
  );
}
