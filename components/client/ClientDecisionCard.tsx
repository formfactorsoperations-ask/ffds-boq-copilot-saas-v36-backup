import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectDecisionRecord } from '../../types';
import { formatINR } from '../../lib/utils';

const MotionDiv = motion.div as any;
const MotionSpan = motion.span as any;
const MotionButton = motion.button as any;

/** Whole days since an ISO timestamp, or null when there isn't one. */
function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

const isImage = (url?: string) => !!url && /\.(jpe?g|gif|png|webp|avif)(\?|$)/i.test(url);

interface Props {
  decision: ProjectDecisionRecord;
  nature: 'design' | 'site';
  busy: boolean;
  onApprove: () => void;
  onQuery: (text: string) => void;
}

/**
 * One decision the client still has to answer.
 *
 * The portal used to render these as a title, a line of description and an
 * Approve button. Three things were missing and all three mattered:
 *
 *  - the drawing. Attaching one is a required step for the studio, and the
 *    client was being asked to approve against a document they could not open.
 *  - the money. `impactCost` and `impactSchedule` were already carried in the
 *    projection; the client approved a cost without being shown it.
 *  - any answer other than yes. The ledger has always accepted 'queried' --
 *    the sign-off email link offers it -- but inside the portal the only
 *    available response was to agree.
 */
export default function ClientDecisionCard({ decision, nature, busy, onApprove, onQuery }: Props) {
  const [asking, setAsking] = React.useState(false);
  const [text, setText] = React.useState('');

  const waiting = daysSince(decision.notifiedAt);
  const cost = Number(decision.impactCost) || 0;

  // Records written before the thread existed carry at most one turn each way.
  const thread = decision.discussion?.length
    ? decision.discussion
    : [
        ...(decision.clientQuery ? [{ from: 'client' as const, text: decision.clientQuery }] : []),
        ...(decision.studioReply ? [{ from: 'studio' as const, text: decision.studioReply }] : []),
      ] as { from: 'client' | 'studio'; text: string; at?: string }[];

  return (
    <div className="px-4 sm:px-5 py-4 space-y-3.5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900">{decision.title}</p>
            <span
              className={`inline-flex items-center text-[10px] font-black px-1.5 py-0.5 rounded border ${
                nature === 'design'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-teal-50 text-teal-700 border-teal-200'
              }`}
            >
              {nature === 'design' ? 'Design' : 'Site'}
            </span>
          </div>

          {decision.description && (
            <p className="text-[12.5px] text-slate-600 font-medium mt-1 leading-relaxed">
              {decision.description}
            </p>
          )}

          <p className="text-[11px] text-slate-400 font-medium mt-1">
            {nature === 'site'
              ? 'Site work on this item is held until you confirm.'
              : 'Drawings for this item are held until you confirm.'}
            {waiting !== null && waiting > 0 && ` · Asked ${waiting} ${waiting === 1 ? 'day' : 'days'} ago`}
          </p>
        </div>
      </div>

      {/* What saying yes actually costs. Silence here is not neutral -- it asks
          someone to agree to a number they have not been shown. */}
      {(cost > 0 || decision.impactSchedule) && (
        <div className="flex flex-wrap gap-2">
          {cost > 0 && (
            <MotionSpan
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200"
            >
              Adds {formatINR(cost)}
            </MotionSpan>
          )}
          {decision.impactSchedule && (
            <MotionSpan
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-sky-50 text-[#0055B3] border border-sky-200"
            >
              {decision.impactSchedule} added to the programme
            </MotionSpan>
          )}
        </div>
      )}

      {/* The whole exchange, oldest first.
          `clientQuery` / `studioReply` hold only the most recent turn, so a
          second question used to overwrite the first and the conversation
          vanished. The thread is the record; those two are the fallback for
          decisions logged before it existed. */}
      {thread.length > 0 && (
        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {thread.map((m, i) => (
            <MotionDiv
              key={i}
              initial={{ opacity: 0, x: m.from === 'studio' ? 6 : -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className={`px-3.5 py-2.5 ${m.from === 'studio' ? 'bg-white' : 'bg-slate-50'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={`text-[10px] uppercase font-black tracking-wider ${
                    m.from === 'studio' ? 'text-[#0055B3]' : 'text-slate-400'
                  }`}
                >
                  {m.from === 'studio' ? 'We answered' : 'You asked'}
                </p>
                {m.at && (
                  <span className="text-[10px] text-slate-400 font-medium shrink-0">
                    {new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              <p
                className={`text-[12.5px] text-slate-700 font-medium mt-0.5 ${
                  m.from === 'client' ? 'italic' : ''
                }`}
              >
                {m.from === 'client' ? `"${m.text}"` : m.text}
              </p>
            </MotionDiv>
          ))}
        </div>
      )}

      {/* The drawing being approved against. A preview earns the full width;
          a link to a PDF does not — a full-bleed bar reads as a section header
          rather than something you press. */}
      {decision.drawingUrl ? (
        isImage(decision.drawingUrl) ? (
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <img
              src={decision.drawingUrl}
              alt={`Drawing for ${decision.title}`}
              className="w-full max-h-[320px] object-contain"
            />
            <a
              href={decision.drawingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3.5 py-2 text-[11px] font-bold text-[#0055B3] hover:bg-slate-50 border-t border-slate-100 transition"
            >
              Open full size
            </a>
          </div>
        ) : (
          <a
            href={decision.drawingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-[#0055B3] hover:bg-slate-50 transition"
          >
            Open the drawing
          </a>
        )
      ) : (
        <p className="text-[11px] text-slate-400 font-medium italic">
          No drawing attached yet — ask us for one if you need it before deciding.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <MotionButton
          whileTap={{ scale: 0.97 }}
          onClick={onApprove}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-[#0066CC] text-white hover:bg-[#0055B3] disabled:opacity-50 transition-colors"
        >
          Approve
        </MotionButton>
        <MotionButton
          whileTap={{ scale: 0.97 }}
          onClick={() => setAsking(v => !v)}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {asking ? 'Never mind' : 'I have a question'}
        </MotionButton>
      </div>

      <AnimatePresence initial={false}>
        {asking && (
          <MotionDiv
            key="query"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-2"
          >
            <textarea
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What would you like changed, or what isn't clear?"
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onQuery(text.trim()); setAsking(false); setText(''); }}
                disabled={busy || !text.trim()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Send to the studio
              </button>
              <span className="text-[11px] text-slate-400">
                Nothing is approved while a question is open.
              </span>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
