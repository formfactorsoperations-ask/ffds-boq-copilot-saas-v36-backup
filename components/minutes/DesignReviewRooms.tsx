import React from 'react';
import { ShieldCheck, ListChecks, FileText, Check } from '@/lib/lucide-shim';
import { designReviewCounts, fmtShortDay, type DesignReviewRecord } from '../../lib/minutes';
import { Panel, Chip, KindChip } from './MinutesBits';

/*
  DESIGN REVIEW MINUTES (mockup 9).

  The rooms shown at a design review in Design Desk, their outcomes and the
  changes pinned on the sheets, exactly as the client agreed them there. They
  are locked on the minutes: the writer adds only what was said around the
  drawings. The studio sees whether a room went past the included revision
  rounds; the client never does, and nobody here sees a fee.
*/

const stamp = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function DesignReviewRooms({ review, studio, compact, forClient }: {
  review: DesignReviewRecord;
  /** The studio's view: revision rounds shown. Off for the client. */
  studio?: boolean;
  /** Agreed rooms in one line, as the review screen shows them. */
  compact?: boolean;
  /** The client's portal: they agreed these at the review, and confirm only what else was discussed. */
  forClient?: boolean;
}) {
  const n = designReviewCounts(review);
  const withChanges = review.rooms.filter((r) => r.outcome === 'changes');
  const agreed = review.rooms.filter((r) => r.outcome === 'agreed');
  const shownAgreed = compact ? [] : agreed;
  return (
    <>
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-start gap-3 hud-panel-in">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <p className="text-sm text-emerald-900 flex-1">
          <b>{forClient ? 'From your design review' : 'From the design review in Design Desk'}{review.heldAt ? `, ${fmtShortDay(review.heldAt)}` : ''}.</b>{' '}
          {forClient
            ? 'You agreed these rooms and changes at the review. They are here for reference; below, confirm only what else was discussed.'
            : review.confirmed
            ? `Rooms, outcomes and pinned changes are as ${review.confirmed.name} confirmed them on ${stamp(review.confirmed.at)}, so they are locked here.`
            : 'Rooms, outcomes and pinned changes are as recorded at the review, so they are locked here.'}
        </p>
      </div>
      <Panel icon={ListChecks} title="Rooms shown"
        blurb={`${n.agreed} agreed · ${n.withChanges} with changes · ${n.changes} change${n.changes === 1 ? '' : 's'} pinned on the sheets`}>
        <div className="space-y-3">
          {[...withChanges, ...shownAgreed].map((r, i) => (
            <div key={r.room} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 hud-row-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                <p className="font-bold text-slate-800 flex-1 min-w-[120px]">{r.room}</p>
                {studio && r.round != null && (r.beyond
                  ? <Chip tone="amber">Revision {r.round} · beyond included</Chip>
                  : <Chip>Revision {r.round}</Chip>)}
                {r.outcome === 'agreed' ? <Chip tone="emerald"><Check className="w-3 h-3" />Agreed</Chip> : <Chip tone="rose">Changes</Chip>}
              </div>
              {r.sheets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                  {r.sheets.map((s) => (
                    <span key={`${s.name}:${s.versionNo}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                      <FileText className="w-3 h-3 text-slate-400" />{s.name}<span className="text-slate-400">v{s.versionNo}</span>
                    </span>
                  ))}
                </div>
              )}
              {r.changes.length > 0 && (
                <div className="space-y-2">
                  {r.changes.map((c) => (
                    <div key={c.n} className="flex flex-wrap sm:flex-nowrap items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black grid place-items-center shrink-0">{c.n}</span>
                      <KindChip kind="design_change" />
                      <p className="text-sm text-slate-800 flex-1 min-w-[140px]">{c.text}</p>
                      {c.sheet && <span className="text-[11px] text-slate-500 shrink-0">{c.sheet}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {compact && agreed.length > 0 && (
            <p className="text-xs text-slate-500 px-1">{withChanges.length ? '+ ' : ''}{agreed.length} room{agreed.length === 1 ? '' : 's'} agreed: {agreed.map((r) => r.room).join(', ')}</p>
          )}
        </div>
      </Panel>
    </>
  );
}

/** What the review sends on, for "Where this goes": the changes are already on the sheets. */
export function designReviewRoutes(review: DesignReviewRecord | null | undefined): { n: number; what: string; to: string }[] {
  if (!review) return [];
  const n = designReviewCounts(review);
  return [
    ...(n.changes ? [{ n: n.changes, what: `design change${n.changes === 1 ? '' : 's'}`, to: 'On the sheets in Design Desk, for the designer' }] : []),
    ...(n.beyond ? [{ n: n.beyond, what: `revision${n.beyond === 1 ? '' : 's'} past the included rounds`, to: 'A lead decides whether to bill, in Design Desk' }] : []),
  ];
}
