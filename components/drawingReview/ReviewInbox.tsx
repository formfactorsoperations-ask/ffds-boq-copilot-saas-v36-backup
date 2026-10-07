import React, { useMemo } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { stateOf, type ReviewState } from '../../lib/drawingReview';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { SheetCard, Thumb, Initials, roomLabel, ago, shortDate, firstName } from './ui';
import type { Me } from './SheetStudio';

/*
  THE DESIGN HEAD'S INBOX: every sheet waiting for her, oldest first, across
  the studio's projects; then what is back with the designers and what she
  approved lately. One button starts the run, and the review screen moves
  straight on to the next sheet after each decision.
*/

interface Props {
  rows: ReviewDrawing[] | null;
  projectName: (id: string) => string;
  me: Me;
  onOpen: (projectId: string, drawingId: string) => void;
  error?: string | null;
}

export const queueOf = (rows: ReviewDrawing[] | null) =>
  (rows || []).filter((d) => stateOf(d.review) === 'IN_REVIEW').sort((a, b) => (a.review?.submittedAt || 0) - (b.review?.submittedAt || 0));

export default function ReviewInbox({ rows, projectName, me, onOpen, error }: Props) {
  const queue = useMemo(() => queueOf(rows), [rows]);
  const by = (s: ReviewState) => (rows || []).filter((d) => stateOf(d.review) === s).sort((a, b) => (b.review?.decidedAt || 0) - (a.review?.decidedAt || 0));
  const returned = by('CHANGES_REQUESTED');
  const approved = by('APPROVED').slice(0, 8);
  const oldest = queue[0];

  if (error) return <div className="mx-auto max-w-md py-24 text-center text-[#66786F]"><p className="text-lg font-semibold text-[#14211E]">The inbox could not load.</p><p className="mt-1">{error}</p></div>;
  if (!rows) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const li = (d: ReviewDrawing, sub: string) => (
    <button key={`${d.projectId}/${d.id}`} type="button" onClick={() => onOpen(d.projectId, d.id)} className="flex w-full items-center gap-2.5 border-t border-[#ECF0ED] px-3.5 py-2.5 text-left first:border-t-0 hover:bg-[#F3F6F4]">
      <span className="aspect-[1.414/1] w-[54px] shrink-0 overflow-hidden rounded-[3px] bg-[#FBFAF6]" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }}><Thumb path={d.review?.thumbPath} className="h-full w-full" /></span>
      <span className="min-w-0 flex-1"><b className="block truncate text-[13px] text-[#14211E]">{d.name}</b><span className="block truncate text-[11.5px] text-[#66786F]">{sub}</span></span>
    </button>
  );

  return (
    <div>
      {queue.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="min-w-[260px] flex-1">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#66786F]">Review</p>
              <h1 className="font-display font-medium leading-[1.12] tracking-tight text-[#14211E]" style={{ fontSize: 'clamp(26px, 3vw, 36px)' }}>
                Hello, {firstName(me.name)}.<br /><b className="font-semibold text-[#5B5BD6]">{queue.length} sheet{queue.length === 1 ? '' : 's'}</b> waiting for your eye.
              </h1>
              <p className="mt-2 text-[15px] text-[#66786F]">The oldest, {oldest.name} from {firstName(oldest.review?.designer?.name)}, has waited since {ago(oldest.review?.submittedAt)}.</p>
            </div>
            <button type="button" onClick={() => onOpen(oldest.projectId, oldest.id)} className="inline-flex items-center gap-2 rounded-[10px] bg-[#14211E] px-5 py-3 text-sm font-bold text-white">Start reviewing <ArrowRight size={16} /></button>
          </div>
          <div className="-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-4 pt-2.5" style={{ scrollSnapType: 'x mandatory' }}>
            {queue.map((d) => {
              const late = d.targetDate && new Date(d.targetDate).getTime() < Date.now();
              return (
                <div key={`${d.projectId}/${d.id}`} className="w-[270px] shrink-0" style={{ scrollSnapAlign: 'start' }}>
                  <SheetCard d={d} me={me.email} projectName={projectName(d.projectId)} onOpen={() => onOpen(d.projectId, d.id)}
                    extra={(
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Initials name={d.review?.designer?.name} size={22} />
                        <span className="rounded-full bg-[#ECECFC] px-2 py-0.5 text-[11px] font-bold text-[#5B5BD6]">v{d.review?.versionNo} · review {d.review?.attempts}</span>
                        {d.review?.designer?.email === me.email && <span className="rounded-full bg-[#ECF0ED] px-2 py-0.5 text-[11px] font-bold text-[#66786F]">Your own</span>}
                        {d.review?.audience === 'studio' && <span className="rounded-full bg-[#FBF0E1] px-2 py-0.5 text-[11px] font-bold text-[#B4690E]">Studio only</span>}
                        {late && <span className="rounded-full bg-[#FBE9EF] px-2 py-0.5 text-[11px] font-bold text-[#C2416A]">Overdue</span>}
                      </div>
                    )} />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mx-auto mb-8 mt-5 flex max-w-md flex-col items-center gap-2.5 text-center">
          <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#E1F1EA] text-[#2E8B6F]"><Check size={34} /></span>
          <h1 className="font-display text-[28px] font-medium text-[#14211E]">Review inbox clear.</h1>
          <p className="text-[#66786F]">New sheets appear here the moment a designer sends them.</p>
        </div>
      )}

      <div className="mt-2.5 grid gap-4 md:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white">
          <div className="flex items-center gap-2 border-b border-[#ECF0ED] px-3.5 py-3"><h3 className="flex-1 font-display text-[14.5px] font-semibold text-[#14211E]">Back with the designers</h3><span className="rounded-full bg-[#FBF0E1] px-2 text-[11.5px] font-bold text-[#B4690E]">{returned.length}</span></div>
          {returned.length ? returned.map((d) => li(d, `${projectName(d.projectId)} · ${roomLabel(d.roomName)} · ${d.review?.marksOpen || 0} of ${d.review?.marksTotal || 0} notes open · ${ago(d.review?.decidedAt)}`))
            : <div className="px-3.5 py-5 text-center text-[12.5px] text-[#66786F]">Nothing returned right now.</div>}
        </section>
        <section className="overflow-hidden rounded-2xl border border-[#E1E7E3] bg-white">
          <div className="flex items-center gap-2 border-b border-[#ECF0ED] px-3.5 py-3"><h3 className="flex-1 font-display text-[14.5px] font-semibold text-[#14211E]">Recently approved</h3><span className="rounded-full bg-[#E1F1EA] px-2 text-[11.5px] font-bold text-[#2E8B6F]">{approved.length}</span></div>
          {approved.length ? approved.map((d) => li(d, `${projectName(d.projectId)} · v${d.review?.versionNo} · ${d.review?.selfApproved ? 'self-approved' : `by ${firstName(d.review?.decidedBy?.name)}`} ${shortDate(d.review?.decidedAt)}`))
            : <div className="px-3.5 py-5 text-center text-[12.5px] text-[#66786F]">Nothing approved yet.</div>}
        </section>
      </div>
    </div>
  );
}
