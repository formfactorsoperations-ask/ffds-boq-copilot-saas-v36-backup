import React, { useMemo } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, FileUp, FolderOpen, Loader2, PenTool, Presentation, Search, Send } from 'lucide-react';
import { GENERAL_ROOM, matchesQuery, needsMe, readyRooms, roomOf, type Viewer } from '../../lib/designDesk';
import { greeting, holderOf, homeLists, mainAction, stepsOf, whereLine } from '../../lib/designDesk2';
import { stateOf } from '../../lib/drawingReview';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { ProjectMark, SheetThumb } from '../drawingReview/DeskParts';
import { firstName, roomLabel } from '../drawingReview/ui';
import { Btn, Card, DueTag, Empty, HolderTag, SectionTitle, StepTrack, Tag, cx } from './parts';

/*
  DESIGN DESK 2.0: Home, a project, a room and All drawings.

  Every page answers one question in plain words. Home: what do I do now. A
  project: which room. A room: where is each drawing and what is its one
  button. All drawings: where is everything. The rules and the data are
  today's (lib/drawingReview, lib/designDesk); only the screens are new.
*/

export interface ProjectCard { id: string; name: string; client?: string; code: string; color: string; soft: string; total: number; need: number; done: number }

/** What every page needs from the desk. */
export interface DeskCtx {
  rows: ReviewDrawing[];
  viewer: Viewer;
  uploader: boolean;
  meName: string;
  projectOf: (id: string) => { name: string; code: string; color: string; soft: string };
  sending: Set<string>;
  /** Do the drawing's one main thing: send it, or open it. */
  act: (d: ReviewDrawing) => void;
  open: (d: ReviewDrawing) => void;
  /** Open the three-step upload on this drawing. */
  upload: (d: ReviewDrawing) => void;
  goProject: (id: string) => void;
  goRoom: (projectId: string, room: string) => void;
  goMeetings?: () => void;
  addPdfs: (projectId?: string) => void;
}

const keyOf = (d: ReviewDrawing) => `${d.projectId}/${d.id}`;

/* ------------------------------------------------------------ one drawing, as a row */

const MainButton: React.FC<{ c: DeskCtx; d: ReviewDrawing; big?: boolean; light?: boolean }> = ({ c, d, big, light }) => {
  const a = mainAction(d, c.viewer, c.uploader);
  const busy = c.sending.has(keyOf(d));
  return (
    <Btn kind={light ? 'light' : a.primary ? 'primary' : 'plain'} big={big} disabled={busy}
      icon={busy ? Loader2 : a.kind === 'send' ? Send : a.kind === 'upload' ? FileUp : ArrowRight}
      onClick={(e) => { e.stopPropagation(); c.act(d); }}>{a.label}</Btn>
  );
};

const DrawingRow: React.FC<{ c: DeskCtx; d: ReviewDrawing; i: number; showProject?: boolean }> = ({ c, d, i, showProject }) => {
  const p = c.projectOf(d.projectId);
  return (
    <div className="hud-row-in flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 hover:bg-slate-50" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
      <button type="button" onClick={() => c.open(d)} className="flex min-w-0 flex-[1_1_320px] items-center gap-3 text-left">
        <SheetThumb d={d} className="w-[84px]" />
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-slate-800">{d.name}</span>
          <span className="block truncate text-sm text-slate-500">{showProject ? `${p.name} · ` : ''}{roomLabel(d.roomName)}{d.review?.versionNo ? ` · v${d.review.versionNo}` : ''}</span>
          <span className="mt-0.5 block text-sm text-slate-700">{whereLine(d, c.viewer)}</span>
        </span>
      </button>
      <span className="flex flex-wrap items-center gap-2">
        <DueTag targetDate={d.targetDate} />
        <HolderTag holder={holderOf(d, c.viewer)} />
      </span>
      <MainButton c={c} d={d} />
    </div>
  );
};

const RowList: React.FC<{ c: DeskCtx; rows: ReviewDrawing[]; showProject?: boolean }> = ({ c, rows, showProject }) => (
  <Card className="divide-y divide-slate-100 overflow-hidden">
    {rows.map((d, i) => <DrawingRow key={keyOf(d)} c={c} d={d} i={i} showProject={showProject} />)}
  </Card>
);

/* ------------------------------------------------------------ Home */

export const Home: React.FC<{ c: DeskCtx; projects: ProjectCard[]; canMeet: boolean }> = ({ c, projects, canMeet }) => {
  const lists = useMemo(() => homeLists(c.rows, c.viewer), [c.rows, c.viewer]);
  const n = (lists.start ? 1 : 0) + lists.todo.length;
  const ready = useMemo(() => readyRooms(c.rows), [c.rows]);
  const s = lists.start;
  return (
    <div>
      <section className="hud-panel-in overflow-hidden rounded-3xl bg-gradient-to-br from-[#0C1F1A] to-emerald-900 p-5 text-white shadow-sm sm:p-7">
        <p className="text-sm font-semibold text-emerald-100">{greeting()}, {firstName(c.meName)}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{n ? `${n} drawing${n === 1 ? ' needs' : 's need'} you today` : 'Nothing needs you right now'}</h2>
        {s ? (
          <div className="mt-5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Start here</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-4">
              <button type="button" onClick={() => c.open(s)} className="flex min-w-0 flex-[1_1_340px] items-center gap-4 text-left">
                <SheetThumb d={s} className="w-[120px]" />
                <span className="min-w-0">
                  <span className="block truncate text-xl font-bold">{s.name}</span>
                  <span className="block truncate text-sm text-emerald-100">{c.projectOf(s.projectId).name} · {roomLabel(s.roomName)}</span>
                  <span className="mt-1 block text-base text-white">{whereLine(s, c.viewer)}</span>
                </span>
              </button>
              <span className="flex flex-wrap items-center gap-2"><DueTag targetDate={s.targetDate} /></span>
              <MainButton c={c} d={s} big light />
            </div>
            <div className="mt-5 rounded-xl bg-white px-3 pb-2 pt-3"><StepTrack steps={stepsOf(s)} yours /></div>
          </div>
        ) : (
          <p className="mt-2 max-w-xl text-base text-emerald-100">When a drawing is waiting for you, it shows here first, with one button that says what to do.</p>
        )}
      </section>

      {lists.todo.length > 0 && <>
        <SectionTitle hint="In the order they are due">Then do these</SectionTitle>
        <RowList c={c} rows={lists.todo} showProject />
      </>}

      {lists.waiting.length > 0 && <>
        <SectionTitle hint="Nothing for you to do yet">Waiting for someone else</SectionTitle>
        <RowList c={c} rows={lists.waiting} showProject />
      </>}

      {canMeet && ready.length > 0 && <>
        <SectionTitle hint="Approved in the studio, not yet shown to the client">Ready for the next client meeting</SectionTitle>
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Presentation size={20} aria-hidden /></span>
          <span className="min-w-0 flex-[1_1_260px]">
            <span className="block text-base font-bold text-slate-800">{ready.length} room{ready.length === 1 ? ' is' : 's are'} ready to show</span>
            <span className="block truncate text-sm text-slate-500">{ready.slice(0, 4).map((r) => `${r.room === GENERAL_ROOM ? 'Whole home' : r.room} (${c.projectOf(r.projectId).name})`).join(', ')}{ready.length > 4 ? ` and ${ready.length - 4} more` : ''}</span>
          </span>
          {c.goMeetings && <Btn kind="plain" icon={Presentation} onClick={c.goMeetings}>Go to Meetings</Btn>}
        </Card>
      </>}

      <SectionTitle hint="Open one to see its rooms">Your projects</SectionTitle>
      {projects.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p, i) => (
            <button key={p.id} type="button" onClick={() => c.goProject(p.id)} style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
              className="hud-row-in phd-lift flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-500 hover:shadow-md">
              <ProjectMark code={p.code} color={p.color} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-slate-800">{p.name}</span>
                <span className="block truncate text-sm text-slate-500">{p.client ? `${p.client} · ` : ''}{p.total} drawing{p.total === 1 ? '' : 's'}{p.total ? ` · ${p.done} approved` : ''}</span>
              </span>
              {p.need > 0 ? <Tag tone="you">{p.need} need{p.need === 1 ? 's' : ''} you</Tag> : <ChevronRight size={18} className="text-slate-400" aria-hidden />}
            </button>
          ))}
        </div>
      ) : <Empty icon={PenTool} title="No projects yet" line="When the studio assigns you to a project, its drawings appear here." />}
    </div>
  );
};

/* ------------------------------------------------------------ a project: its rooms */

const Back: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="mb-3 inline-flex min-h-[40px] items-center gap-1 rounded-xl pl-2 pr-3 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800">
    <ChevronLeft size={18} aria-hidden />{children}
  </button>
);

export const ProjectPage: React.FC<{ c: DeskCtx; projectId: string; client?: string; loading: boolean; onBack: () => void }> = ({ c, projectId, client, loading, onBack }) => {
  const p = c.projectOf(projectId);
  const rows = useMemo(() => c.rows.filter((d) => d.projectId === projectId), [c.rows, projectId]);
  const rooms = useMemo(() => {
    const by = new Map<string, ReviewDrawing[]>();
    rows.forEach((d) => by.set(roomOf(d), [...(by.get(roomOf(d)) || []), d]));
    return [...by.entries()].map(([room, list]) => ({
      room, list,
      need: list.filter((d) => needsMe(d, c.viewer)).length,
      done: list.filter((d) => stateOf(d.review) === 'APPROVED').length,
    })).sort((a, b) => b.need - a.need || a.room.localeCompare(b.room));
  }, [rows, c.viewer]);
  return (
    <div>
      <Back onClick={onBack}>Home</Back>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <ProjectMark code={p.code} color={p.color} size={52} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-tight text-slate-800">{p.name}</h2>
          <p className="text-sm text-slate-500">{client ? `${client} · ` : ''}Pick a room to see its drawings.</p>
        </div>
        {c.uploader && <Btn kind="primary" icon={FileUp} onClick={() => c.addPdfs(projectId)}>Upload drawings</Btn>}
      </div>
      {loading ? (
        <div className="grid min-h-[30vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
      ) : rooms.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((r, i) => (
            <button key={r.room} type="button" onClick={() => c.goRoom(projectId, r.room)} style={{ animationDelay: `${Math.min(i, 9) * 30}ms` }}
              className="hud-row-in phd-lift min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-500 hover:shadow-md">
              <span className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><FolderOpen size={20} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-800">{roomLabel(r.room)}</span>
                  <span className="block text-sm text-slate-500">{r.list.length} drawing{r.list.length === 1 ? '' : 's'} · {r.done} approved</span>
                </span>
                {r.need > 0 && <Tag tone="you">{r.need} need{r.need === 1 ? 's' : ''} you</Tag>}
              </span>
              <span className="mt-3 flex gap-1.5" aria-hidden>
                {r.list.slice(0, 5).map((d) => <React.Fragment key={d.id}><SheetThumb d={d} className="w-[52px]" /></React.Fragment>)}
                {r.list.length > 5 && <span className="grid w-[52px] place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">+{r.list.length - 5}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={FolderOpen} title="No drawings in this project yet" line="Drawings are listed in the project's Drawings tab. Once they are there, upload their PDFs here.">
          {c.uploader && <Btn kind="primary" icon={FileUp} onClick={() => c.addPdfs(projectId)}>Upload drawings</Btn>}
        </Empty>
      )}
    </div>
  );
};

/* ------------------------------------------------------------ a room: its drawings */

export const RoomPage: React.FC<{ c: DeskCtx; projectId: string; room: string; onBack: () => void }> = ({ c, projectId, room, onBack }) => {
  const p = c.projectOf(projectId);
  const rows = useMemo(() => c.rows.filter((d) => d.projectId === projectId && roomOf(d) === room)
    .sort((a, b) => Number(needsMe(b, c.viewer)) - Number(needsMe(a, c.viewer)) || a.name.localeCompare(b.name)), [c.rows, projectId, room, c.viewer]);
  return (
    <div>
      <Back onClick={onBack}>{p.name}</Back>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-tight text-slate-800">{roomLabel(room)}</h2>
          <p className="text-sm text-slate-500">{p.name} · {rows.length} drawing{rows.length === 1 ? '' : 's'}. Each one shows its steps and one button.</p>
        </div>
        {c.uploader && <Btn kind="plain" icon={FileUp} onClick={() => c.addPdfs(projectId)}>Upload drawings</Btn>}
      </div>
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((d, i) => {
            const yours = needsMe(d, c.viewer);
            return (
              <Card key={d.id} delay={Math.min(i, 8) * 40} className={cx('p-4', yours && 'ring-2 ring-amber-300')}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <button type="button" onClick={() => c.open(d)} className="flex min-w-0 flex-[1_1_320px] items-center gap-4 text-left">
                    <SheetThumb d={d} className="w-[120px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-bold text-slate-800">{d.name}</span>
                      <span className="mt-0.5 block text-sm text-slate-700">{whereLine(d, c.viewer)}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {d.review?.versionNo ? <Tag>v{d.review.versionNo}</Tag> : null}
                        <DueTag targetDate={d.targetDate} />
                        <HolderTag holder={holderOf(d, c.viewer)} />
                      </span>
                    </span>
                  </button>
                  <span className="flex flex-wrap items-center gap-2">
                    {c.uploader && yours && stateOf(d.review) === 'CHANGES_REQUESTED' && <Btn kind="plain" icon={FileUp} onClick={() => c.upload(d)}>Upload the fixed drawing</Btn>}
                    <MainButton c={c} d={d} />
                  </span>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3"><StepTrack steps={stepsOf(d)} yours={yours} /></div>
              </Card>
            );
          })}
        </div>
      ) : <Empty icon={CheckCircle2} title="No drawings in this room" line="Drawings are added to a room in the project's Drawings tab." />}
    </div>
  );
};

/* ------------------------------------------------------------ All drawings */

export const AllDrawings: React.FC<{ c: DeskCtx; q: string; setQ: (v: string) => void; onlyMine: boolean; setOnlyMine: (v: boolean) => void; partial: boolean; loading: boolean }> = ({ c, q, setQ, onlyMine, setOnlyMine, partial, loading }) => {
  const rows = useMemo(() => c.rows
    .filter((d) => !onlyMine || needsMe(d, c.viewer) || (!!c.viewer.email && d.review?.designer?.email === c.viewer.email))
    .filter((d) => matchesQuery(d, q, c.projectOf(d.projectId).name))
    .sort((a, b) => Number(needsMe(b, c.viewer)) - Number(needsMe(a, c.viewer)) || c.projectOf(a.projectId).name.localeCompare(c.projectOf(b.projectId).name) || a.name.localeCompare(b.name)),
  [c.rows, c.viewer, q, onlyMine]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] min-w-0 flex-[1_1_280px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
          <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a drawing, a room, a project or a designer" aria-label="Search drawings"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
        </label>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-[18px] w-[18px] accent-emerald-600" />Only mine
        </label>
        <span className="text-sm text-slate-500">{rows.length} drawing{rows.length === 1 ? '' : 's'}</span>
      </div>
      {loading ? (
        <div className="grid min-h-[30vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>
      ) : rows.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-bold">Drawing</th><th className="px-3 py-3 font-bold">Project</th><th className="px-3 py-3 font-bold">Where it is now</th><th className="px-3 py-3 font-bold">Due</th><th className="px-4 py-3 font-bold">With</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d, i) => {
                const p = c.projectOf(d.projectId);
                return (
                  <tr key={keyOf(d)} onClick={() => c.open(d)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') c.open(d); }}
                    className="hud-row-in cursor-pointer align-middle hover:bg-slate-50 focus:bg-slate-50 focus:outline-none" style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <SheetThumb d={d} className="w-[64px]" />
                        <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{d.name}</span><span className="block truncate text-xs text-slate-500">{roomLabel(d.roomName)}{d.review?.versionNo ? ` · v${d.review.versionNo}` : ''}</span></span>
                      </span>
                    </td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-2 text-sm text-slate-700"><ProjectMark code={p.code} color={p.color} size={24} round />{p.name}</span></td>
                    <td className="px-3 py-3 text-sm text-slate-700">{whereLine(d, c.viewer)}</td>
                    <td className="px-3 py-3"><DueTag targetDate={d.targetDate} /></td>
                    <td className="px-4 py-3"><HolderTag holder={holderOf(d, c.viewer)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : <Empty icon={Search} title="No drawing matches" line={q || onlyMine ? 'Clear the search or untick Only mine to see everything.' : 'Drawings appear here once their PDFs are uploaded.'} />}
      {partial && <p className="mt-3 text-sm text-slate-500">Across every project this list shows drawings that have a PDF. Open a project from Home to see the ones not started.</p>}
    </div>
  );
};
