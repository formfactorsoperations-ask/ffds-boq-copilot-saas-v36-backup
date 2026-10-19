import React from 'react';
import { allLines, lineRefs, selectionText, type CorrectionLine, type MinutesTopic } from '../../lib/minutes';
import { KindChip, EYEBROW } from './MinutesBits';

/*
  WHAT THE CLIENT ASKED TO CHANGE.

  Each line the client marked, as the minutes say it now, next to what the
  client wrote about it, so whoever answers sees both without hunting for
  "A1" in the document. Minutes corrected before lines could be marked carry
  only the client's note; that shows on its own.
*/

const stamp = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function ClientCorrections({ corrections, note, by, at, topics }: {
  corrections: CorrectionLine[];
  /** The client's note as a whole, for minutes corrected before lines could be marked. */
  note?: string | null;
  by?: string | null;
  at?: number | null;
  /** The minutes as the client read them, to quote each marked line. */
  topics: MinutesTopic[];
}) {
  const lines = allLines(topics);
  const refs = lineRefs(topics);
  const who = by || 'The client';
  const items = corrections.length ? corrections : note ? [{ lineId: '', ref: '', text: note }] : [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        <b className="text-slate-800">{who}</b> marked {items.length === 1 ? 'one line' : `${items.length} lines`}{at ? ` on ${stamp(at)}` : ''}.
      </p>
      {items.map((k, i) => {
        const hit = k.lineId ? lines.find(({ line }) => line.id === k.lineId) : null;
        const said = hit ? (hit.line.kind === 'selection' ? selectionText(hit.line) : hit.line.text) : '';
        const ref = refs[k.lineId] || k.ref;
        return (
          <div key={`${k.lineId}:${i}`} className="rounded-xl border border-rose-200 bg-white overflow-hidden hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            {hit && (
              <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {ref && <span className="text-[11px] font-bold text-slate-500 tabular-nums">{ref}</span>}
                  <KindChip kind={hit.line.kind} />
                  {hit.topic.title && <span className="text-[11px] text-slate-500 truncate">{hit.topic.title}</span>}
                </div>
                <p className={EYEBROW}>The minutes say</p>
                <p className="text-sm text-slate-700">{said}</p>
                {hit.line.owner?.name && <p className="text-[11px] text-slate-500 mt-0.5">{hit.line.owner.name}</p>}
              </div>
            )}
            <div className="px-3 py-2.5 bg-rose-50/60">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">{hit ? `${who} says` : `${who} wrote`}</p>
              <p className="text-sm text-rose-900">“{k.text}”</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
