import React, { useMemo } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { stateOf, type ReviewState } from '../../lib/drawingReview';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { SheetCard, Thumb, Initials, DueChip, dueRank, roundWarnText, roomLabel, ago, shortDate, firstName } from './ui';
import type { Me } from './SheetStudio';

/*
  THE DESIGN HEAD'S INBOX: every sheet waiting for her across the studio's
  projects, the overdue first and then the oldest; then what is due soon,
  what is back with the designers and what she approved lately, alongside.
  One line on top says how much is waiting and starts the run; the review
  screen then moves straight on to the next sheet after each decision.
*/

export type InboxFilter = { project: string | null; designer: string | null };

interface Props {
  rows: ReviewDrawing[] | null;
  projectName: (id: string) => string;
  me: Me;
  onOpen: (projectId: string, drawingId: string) => void;
  error?: string | null;
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
}

const designerOf = (d: ReviewDrawing) => d.review?.designer?.email || d.review?.designer?.name || '';
export const passes = (d: ReviewDrawing, f: InboxFilter) =>
  (!f.project || d.projectId === f.project) && (!f.designer || designerOf(d) === f.designer);

export const queueOf = (rows: ReviewDrawing[] | null, f: InboxFilter = { project: null, designer: null }) =>
  (rows || []).filter((d) => stateOf(d.review) === 'IN_REVIEW' && passes(d, f))
    .sort((a, b) => Math.min(dueRank(a), 1) - Math.min(dueRank(b), 1) || (a.review?.submittedAt || 0) - (b.review?.submittedAt || 0));

export default function ReviewInbox({ rows, projectName, me, onOpen, error, filter, setFilter }: Props) {
  const queue = useMemo(() => queueOf(rows, filter), [rows, filter]);
  const mine = useMemo(() => (rows || []).filter((d) => passes(d, filter)), [rows, filter]);
  const by = (s: ReviewState) => mine.filter((d) => stateOf(d.review) === s).sort((a, b) => (b.review?.decidedAt || 0) - (a.review?.decidedAt || 0));
  const returned = by('CHANGES_REQUESTED');
  const approved = by('APPROVED').slice(0, 6);
  const due = mine.filter((d) => stateOf(d.review) !== 'APPROVED' && dueRank(d) <= 2).sort((a, b) => dueRank(a) - dueRank(b));
  const oldest = queue[0];

  /* The filters list only what is in the inbox, so no choice comes up empty. */
  const projects = useMemo(() => [...new Set((rows || []).map((d) => d.projectId))].map((id) => ({ id, name: projectName(id) || 'Project' })).sort((a, b) => a.name.localeCompare(b.name)), [rows, projectName]);
  const designers = useMemo(() => {
    const m = new Map<string, string>();
    (rows || []).forEach((d) => { const k = designerOf(d); if (k) m.set(k, d.review?.designer?.name || k); });
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const filtered = !!(filter.project || filter.designer);
  const load = useMemo(() => {
    const m = new Map<string, { id: string; name: string; fix: number; ready: number; review: number }>();
    (rows || []).forEach((d) => {
      const k = designerOf(d); const s = stateOf(d.review);
      if (!k || s === 'APPROVED' || s === 'NONE' || (filter.project && d.projectId !== filter.project)) return;
      const e = m.get(k) || { id: k, name: d.review?.designer?.name || k, fix: 0, ready: 0, review: 0 };
      if (s === 'CHANGES_REQUESTED') e.fix++; else if (s === 'DRAFT') e.ready++; else if (s === 'IN_REVIEW') e.review++;
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => (b.fix + b.ready + b.review) - (a.fix + a.ready + a.review));
  }, [rows, filter.project]);

  if (error) return <div className="mx-auto max-w-md py-24 text-center text-[#66786F]"><p className="text-lg font-semibold text-[#14211E]">The inbox could not load.</p><p className="mt-1">{error}</p></div>;
  if (!rows) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const li = (d: ReviewDrawing, sub: React.ReactNode) => (
    <button key={`${d.projectId}/${d.id}`} type="button" onClick={() => onOpen(d.projectId, d.id)} className="flex w-full items-center gap-2.5 border-t border-[#ECF0ED] px-3.5 py-2.5 text-left first:border-t-0 hover:bg-[#F3F6F4]">
      <span className="aspect-[1.414/1] w-[48px] shrink-0 overflow-hidden rounded-[3px] bg-[#FBFAF6]" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }}><Thumb path={d.review?.thumbPath} className="h-full w-full" /></span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[13px] text-[#14211E]">{d.name}</b><span className="block truncate text-[11.5px] text-[#66786F]">{sub}</span></span>
    </button>
  );
  const panel = (title: string, count: number, tone: string, body: React.ReactNode, empty: string) => (
    <section className="overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white">
      <div className="flex items-center gap-2 border-b border-[#ECF0ED] px-3.5 py-2.5"><h3 className="flex-1 font-display text-[14px] font-semibold text-[#14211E]">{title}</h3><span className={`rounded-full px-2 text-[11.5px] font-bold ${tone}`}>{count}</span></div>
      {count ? body : <div className="px-3.5 py-4 text-center text-[12.5px] text-[#66786F]">{empty}</div>}
    </section>
  );
  const select = (label: string, value: string | null, options: { id: string; name: string }[], set: (v: string | null) => void) => (
    <select aria-label={label} value={value || ''} onChange={(e) => set(e.target.value || null)}
      className={`h-9 max-w-[220px] rounded-full border px-3 text-[12.5px] font-bold outline-none ${value ? 'border-[#5B5BD6] bg-[#ECECFC] text-[#3D52A0]' : 'border-[#E1E7E3] bg-white text-[#2A3B37]'}`}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <p className="min-w-0 flex-1 text-[15px] text-[#2A3B37]">
          {queue.length
            ? <><b className="font-display text-[22px] font-semibold text-[#5B5BD6]">{queue.length}</b> <b className="text-[#14211E]">sheet{queue.length === 1 ? '' : 's'} waiting</b><span className="text-[#66786F]"> · oldest from {firstName(oldest.review?.designer?.name)}, {ago(oldest.review?.submittedAt)}</span></>
            : <><Check size={18} className="mr-1 inline text-[#2E8B6F]" /><b className="text-[#14211E]">{filtered ? 'Nothing waiting here.' : 'Review inbox clear.'}</b><span className="text-[#66786F]"> New sheets appear the moment a designer sends them.</span></>}
        </p>
        {projects.length > 1 && select('All projects', filter.project, projects, (v) => setFilter({ ...filter, project: v }))}
        {designers.length > 1 && select('All designers', filter.designer, designers, (v) => setFilter({ ...filter, designer: v }))}
        {filtered && <button type="button" onClick={() => setFilter({ project: null, designer: null })} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#66786F] hover:text-[#14211E]"><X size={14} />Clear</button>}
        {oldest && <button type="button" onClick={() => onOpen(oldest.projectId, oldest.id)} className="inline-flex items-center gap-2 rounded-[10px] bg-[#14211E] px-4 py-2.5 text-sm font-bold text-white">Start reviewing <ArrowRight size={16} /></button>}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {queue.length ? (
            <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {queue.map((d) => (
                <SheetCard key={`${d.projectId}/${d.id}`} d={d} me={me.email} projectName={projectName(d.projectId)} onOpen={() => onOpen(d.projectId, d.id)}
                  extra={(
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Initials name={d.review?.designer?.name} size={22} />
                      <span className="rounded-full bg-[#ECECFC] px-2 py-0.5 text-[11px] font-bold text-[#5B5BD6]">v{d.review?.versionNo} · review {d.review?.attempts}</span>
                      {d.review?.designer?.email === me.email && <span className="rounded-full bg-[#ECF0ED] px-2 py-0.5 text-[11px] font-bold text-[#66786F]">Your own</span>}
                    </div>
                  )} />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[180px] place-items-center rounded-2xl border-[1.5px] border-dashed border-[#D5DDD8] px-4 text-center text-[13px] text-[#66786F]">
              {filtered ? 'No sheet from this project or designer is waiting.' : 'When a designer sends a sheet, it lands here.'}
            </div>
          )}
        </div>
        <aside className="flex flex-col gap-3.5">
          {load.length > 0 && panel('Designer load', load.length, 'bg-[#ECF0ED] text-[#66786F]',
            load.map((e) => {
              const on = filter.designer === e.id;
              const total = e.fix + e.ready + e.review;
              const max = Math.max(...load.map((x) => x.fix + x.ready + x.review), 1);
              return (
                <button key={e.id} type="button" onClick={() => setFilter({ ...filter, designer: on ? null : e.id })} aria-pressed={on}
                  title={on ? 'Show every designer' : `Show only ${e.name}'s sheets`}
                  className={`flex w-full items-center gap-2.5 border-t border-[#ECF0ED] px-3.5 py-2 text-left first:border-t-0 ${on ? 'bg-[#ECECFC]' : 'hover:bg-[#F3F6F4]'}`}>
                  <Initials name={e.name} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2"><b className="truncate text-[13px] text-[#14211E]">{firstName(e.name)}</b><span className="ml-auto text-[11px] font-bold text-[#66786F]">{total} open</span></span>
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[#ECF0ED]" style={{ width: `${Math.max(12, (total / max) * 100)}%` }}>
                      <i style={{ flex: e.fix, background: '#C2416A' }} /><i style={{ flex: e.ready, background: '#B4690E' }} /><i style={{ flex: e.review, background: '#5B5BD6' }} />
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#66786F]">{[e.fix && `${e.fix} to fix`, e.ready && `${e.ready} ready to send`, e.review && `${e.review} with you`].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              );
            }),
            '')}
          {panel('Due soon', due.length, 'bg-[#FBE9EF] text-[#C2416A]',
            due.slice(0, 6).map((d) => li(d, <><DueChip targetDate={d.targetDate} /> <span className="ml-1">{projectName(d.projectId)} · {stateOf(d.review) === 'IN_REVIEW' ? 'with you' : 'with the designer'}</span></>)),
            'Nothing due this week.')}
          {panel('Back with the designers', returned.length, 'bg-[#FBF0E1] text-[#B4690E]',
            returned.slice(0, 6).map((d) => li(d, <>{roundWarnText(d.review) && <b className="mr-1 text-[#C2416A]">{roundWarnText(d.review)} ·</b>}{`${projectName(d.projectId)} · ${roomLabel(d.roomName)} · ${d.review?.marksOpen || 0} of ${d.review?.marksTotal || 0} notes open · ${ago(d.review?.decidedAt)}`}</>)),
            'Nothing returned right now.')}
          {panel('Recently approved', approved.length, 'bg-[#E1F1EA] text-[#2E8B6F]',
            approved.map((d) => li(d, `${projectName(d.projectId)} · v${d.review?.versionNo} · ${d.review?.selfApproved ? 'self-approved' : `by ${firstName(d.review?.decidedBy?.name)}`} ${shortDate(d.review?.decidedAt)}`)),
            'Nothing approved yet.')}
        </aside>
      </div>
    </div>
  );
}

