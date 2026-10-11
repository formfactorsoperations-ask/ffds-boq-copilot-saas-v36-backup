import React, { useMemo } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Check, Circle, Eye, LayoutGrid, Presentation, Search, Send, Undo2, X, type LucideIcon } from 'lucide-react';
import { stateOf, guessAudience } from '../../lib/drawingReview';
import { matchesQuery, readyRooms, roomOf, GENERAL_ROOM, type DeskState } from '../../lib/designDesk';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { roomLabel, firstName } from './ui';
import { ProjectMark, SheetTile, TONE } from './DeskParts';
import type { ProjectInfo } from './ProjectBand';
import type { DragKit } from './ForYou';
import { Bar, Tilt } from './motion';

/*
  ALL SHEETS: where everything stands. Across every project it starts as one
  tile per project, busiest first; a search or a filter lists the sheets
  themselves. Inside a project, rooms become chips that read "Kitchen 1/3".
*/

export type SheetFilter = 'all' | DeskState;

interface Props {
  scope: ReviewDrawing[];
  isAll: boolean;
  projects: ProjectInfo[];
  projectOf: (id: string) => { name: string; code: string; color: string };
  q: string; setQ: (q: string) => void;
  filter: SheetFilter; setFilter: (f: SheetFilter) => void;
  room: string | null; setRoom: (r: string | null) => void;
  onOpen: (d: ReviewDrawing) => void;
  onPickProject: (id: string) => void;
  reviewer: boolean;
  drag: DragKit;
  /** Across every project only sheets with a PDF are known; inside one project, all of them. */
  partial: boolean;
}

const FILTERS: [SheetFilter, string, LucideIcon][] = [
  ['all', 'All', LayoutGrid], ['IN_REVIEW', 'In review', Eye], ['CHANGES_REQUESTED', 'Changes', Undo2],
  ['DRAFT', 'Ready to send', Send], ['NONE', 'Not started', Circle], ['APPROVED', 'Approved', Check],
];

export default function AllSheets(props: Props) {
  const { scope, isAll, projects, projectOf, q, setQ, filter, setFilter, room, setRoom, onOpen, onPickProject, reviewer, drag, partial } = props;
  const named = (d: ReviewDrawing) => matchesQuery(d, q, projectOf(d.projectId).name);
  const base = useMemo(() => scope.filter((d) => named(d) && (isAll || !room || roomOf(d) === room)), [scope, q, room, isAll]);
  const shown = base.filter((d) => filter === 'all' || stateOf(d.review) === filter);
  const showTiles = isAll && !q.trim() && filter === 'all';
  const filters = FILTERS.filter(([k]) => k !== 'NONE' || !partial);

  const rooms = useMemo(() => {
    if (isAll) return [];
    const m = new Map<string, ReviewDrawing[]>();
    scope.forEach((d) => m.set(roomOf(d), [...(m.get(roomOf(d)) || []), d]));
    const ready = new Set(readyRooms(scope).map((r) => r.room));
    return [...m.entries()]
      .sort((a, b) => (a[0] === GENERAL_ROOM ? 1 : b[0] === GENERAL_ROOM ? -1 : a[0].localeCompare(b[0])))
      .map(([name, list]) => ({ name, total: list.length, approved: list.filter((d) => stateOf(d.review) === 'APPROVED').length, present: ready.has(name) }));
  }, [scope, isAll]);

  const tiles = useMemo(() => [...projects].sort((a, b) => b.need - a.need || a.name.localeCompare(b.name)), [projects]);
  const groups = useMemo(() => {
    if (!isAll) return [{ id: '', list: shown }];
    const m = new Map<string, ReviewDrawing[]>();
    shown.forEach((d) => m.set(d.projectId, [...(m.get(d.projectId) || []), d]));
    return [...m.entries()].map(([id, list]) => ({ id, list })).sort((a, b) => projectOf(a.id).name.localeCompare(projectOf(b.id).name));
  }, [shown, isAll]);

  /* The dark pill slides to the chosen chip instead of jumping. */
  const chip = (on: boolean) => `relative ${on ? 'border-[#17191E] text-white' : 'border-[#DCDCD5] bg-white text-[#17191E] hover:border-[#A9AAA2]'}`;
  const pill = (on: boolean, id: string) => on && <motion.span layoutId={id} className="absolute -inset-px rounded-full bg-[#17191E]" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />;
  const inner = 'relative z-[1] inline-flex items-center gap-1.5';
  /* Tiles glide to their new places when a filter or search changes the grid; past a few hundred, they just appear. */
  const glide = shown.length <= 150;

  return (
    <div className="dd-rise">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="flex min-h-[44px] max-w-[420px] flex-[1_1_260px] items-center gap-2 rounded-xl border border-[#DCDCD5] bg-white px-3 text-[#6B6F78] focus-within:border-[#4146C8] focus-within:shadow-[0_0_0_3px_rgba(65,70,200,0.15)]">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sheets"
            placeholder={isAll ? 'Search every project: sheet, room or designer' : 'Search this project: sheet, room or designer'}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17191E] outline-none placeholder:text-[#8A8E97]" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#EBEBE5]"><X size={13} strokeWidth={2.6} /></button>}
        </label>
        <LayoutGroup id="dd-filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {filters.map(([k, label, Icon]) => {
            const n = k === 'all' ? base.length : base.filter((d) => stateOf(d.review) === k).length;
            return (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors ${chip(filter === k)}`}>
                {pill(filter === k, 'dd-filter-pill')}<span className={inner}><Icon size={14} strokeWidth={2.2} />{label}<span className="font-semibold opacity-70">{n}</span></span>
              </button>
            );
          })}
        </div>
        </LayoutGroup>
      </div>

      {!isAll && rooms.length > 1 && (
        <LayoutGroup id="dd-rooms">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Rooms">
          <button type="button" onClick={() => setRoom(null)} aria-pressed={!room} className={`inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold transition-colors ${chip(!room)}`}>
            {pill(!room, 'dd-room-pill')}<span className={`${inner} gap-2`}>All rooms<span className="text-[12px] font-semibold opacity-80">{scope.length}</span></span>
          </button>
          {rooms.map((r) => (
            <button key={r.name} type="button" onClick={() => setRoom(room === r.name ? null : r.name)} aria-pressed={room === r.name}
              title={r.present ? 'Every client sheet in this room is approved: ready to present' : undefined}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold transition-colors ${chip(room === r.name)}`}>
              {pill(room === r.name, 'dd-room-pill')}<span className={`${inner} gap-2`}>{roomLabel(r.name)}<span className="text-[12px] font-semibold opacity-80">{r.approved}/{r.total}</span>
              {r.present && <span className="inline-flex h-5 items-center gap-1 rounded-full bg-[#1F7A57] px-1.5 text-[10.5px] text-white"><Presentation size={11} />Ready to present</span>}</span>
            </button>
          ))}
        </div>
        </LayoutGroup>
      )}

      {showTiles ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
          {tiles.map((p, i) => {
            const pctN = p.stats.total ? Math.round((p.stats.approved / p.stats.total) * 100) : 0;
            const bits: [number, string, keyof typeof TONE, LucideIcon][] = [[p.stats.review, 'in review', 'indigo', Eye], [p.stats.changes, 'returned', 'amber', Undo2], [p.stats.draft, 'ready to send', 'grey', Send]];
            return (
              <div key={p.id} className="dd-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Tilt className="h-full" glow={`${p.color}1F`}>
              <button type="button" onClick={() => onPickProject(p.id)} aria-label={`Open ${p.name}`}
                className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-[#E4E4DE] bg-white text-left">
                <span className="block h-[5px] w-full" style={{ background: p.color }} />
                <span className="flex w-full items-center gap-3 px-4 pt-3.5">
                  <ProjectMark code={p.code} color={p.color} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold text-[#17191E]">{p.name}</span>
                    {p.client && <span className="block truncate text-[12px] text-[#5F636D]">{p.client}</span>}
                  </span>
                  {p.need > 0 && <span className="rounded-full bg-[#ECEDFB] px-2.5 py-0.5 text-[12px] font-bold text-[#3A3FB8]" title={reviewer ? 'Waiting for your review' : 'Need you'}>{p.need}</span>}
                </span>
                <span className="block w-full px-4 pt-3">
                  <span className="mb-1 flex justify-between text-[12px] font-bold text-[#17191E]"><span>{p.stats.approved} of {p.stats.total} {partial ? 'uploaded ' : ''}approved</span><span className="text-[#5F636D]">{pctN}%</span></span>
                  <Bar pct={pctN} color={p.color} />
                </span>
                <span className="flex flex-wrap gap-1.5 px-4 pb-4 pt-3">
                  {bits.filter(([n]) => n > 0).map(([n, label, tone, Icon]) => (
                    <span key={label} className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-bold" style={{ background: TONE[tone].bg, color: TONE[tone].ink }}><Icon size={12} strokeWidth={2.4} />{n} {label}</span>
                  ))}
                  {!bits.some(([n]) => n > 0) && <span className="text-[12px] text-[#8A8E97]">{p.stats.total ? 'Nothing open' : 'No sheets uploaded yet'}</span>}
                </span>
              </button>
              </Tilt>
              </div>
            );
          })}
          {!tiles.length && <div className="col-span-full rounded-[18px] border border-dashed border-[#D5D5CE] px-4 py-14 text-center text-[13px] text-[#5F636D]">No projects yet. When the studio assigns you to a project, it appears here.</div>}
        </div>
      ) : shown.length ? (
        groups.map((g) => (
          <div key={g.id || 'one'} className="mb-6">
            {isAll && (() => { const p = projectOf(g.id); return (
              <div className="mb-3 mt-1 flex items-center gap-2.5">
                <ProjectMark code={p.code} color={p.color} size={30} />
                <h2 className="font-display text-[18px] font-semibold text-[#17191E]">{p.name}</h2>
                <span className="text-[12.5px] text-[#5F636D]">{g.list.length} sheet{g.list.length === 1 ? '' : 's'}</span>
                <span className="flex-1" />
                <button type="button" onClick={() => onPickProject(g.id)} className="min-h-[36px] rounded-[10px] px-3 text-[13px] font-bold text-[#4F535C] hover:bg-[#EBEBE5] hover:text-[#17191E]">Open project</button>
              </div>
            ); })()}
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {g.list.map((d, i) => {
                const can = drag.can(d);
                const r = d.review;
                return (
                  <SheetTile key={`${d.projectId}/${d.id}`} d={d} delay={Math.min(i, 10) * 35} glide={glide}
                    meta={[roomLabel(d.roomName), r?.versionNo ? `v${r.versionNo}` : null, r?.designer ? firstName(r.designer.name) : null].filter(Boolean).join(' · ')}
                    studio={(r?.audience || guessAudience(d.name)) === 'studio'}
                    draggable={can} dragging={drag.dragging === `${d.projectId}/${d.id}`} onDragStart={can ? drag.start(d) : undefined} onDragEnd={drag.end}
                    onOpen={() => onOpen(d)} />
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-[18px] border border-[#E4E4DE] bg-white px-5 py-9 text-center">
          <div className="font-display text-[18px] font-semibold text-[#17191E]">{scope.length ? 'No sheets match' : 'No drawings yet'}</div>
          <div className="mb-3.5 mt-1 text-[13px] text-[#5F636D]">
            {scope.length ? (q.trim() ? `Nothing matches “${q.trim()}”${filter !== 'all' ? ' with this filter' : ''}.` : 'No sheets have this status here.') : 'Add drawings to this project’s tracker, then drop their PDFs here.'}
          </div>
          {scope.length > 0 && <button type="button" onClick={() => { setQ(''); setFilter('all'); setRoom(null); }} className="min-h-[38px] rounded-[10px] border border-[#DCDCD5] bg-white px-3.5 text-[13px] font-bold text-[#17191E]">Clear search and filters</button>}
        </div>
      )}
    </div>
  );
}
