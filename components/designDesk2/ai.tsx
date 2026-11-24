import React, { useEffect, useState } from 'react';
import { Loader2, Repeat2, Sparkles } from 'lucide-react';
import { MAX_AI_CHANGES, VERDICT_LABEL, freshRepeats, recentDrawingsOf, repeatLine, type ChangeNames, type Repeat, type RepeatMemo, type Verdict } from '../../lib/deskAi';
import type { ReviewMark } from '../../lib/drawingReview';
import type { ReviewDrawing } from '../../services/drawingReviewService';
import { findRepeats, freshMemo, keepChangeNames, keepRepeats, keptChangeNames, keptRepeats, loadPastNotes, nameChanges } from '../../services/deskAiService';
import { useSheetChanges } from '../drawingReview/useSheetChanges';
import { firstName } from '../drawingReview/ui';
import { cx } from './parts';

/*
  DESIGN DESK 2.0: the two AI features on screen (rules: lib/deskAi.ts).

    ChangeAi       names the outlined changes of one page and hints at which
                   of the last revision's notes look fixed. Draws nothing;
                   it reports to the drawing screen.
    ChangesNamed   the list of named changes, in the panel.
    VerdictHint    "AI: looks fixed" beside a note, with the reason.
    useRepeats     the mistakes that keep coming back from one designer.
    RepeatCard     the same, beside the drawing being checked.

  Everything the AI says is marked as its own and sits beside the Design
  Head's check, never in place of it. When the AI cannot be reached the desk
  works as before: the changes are still outlined and the notes still listed.
*/

/* ------------------------------------------------------------ 1. changes found for you */

export interface AiPage { busy: boolean; failed?: boolean; count: number; result?: ChangeNames }

interface ChangeAiProps {
  pdfPath: string;
  prevPath: string;
  page: number;
  /** The two revisions being compared, so what was found is asked for once. */
  pairKey: string;
  /** The last revision's notes on this page. */
  notes: ReviewMark[];
  /** Raised to ask again after a failure. */
  attempt: number;
  onResult: (page: number, state: AiPage) => void;
}

export const ChangeAi: React.FC<ChangeAiProps> = ({ pdfPath, prevPath, page, pairKey, notes, attempt, onResult }) => {
  const { busy, diff } = useSheetChanges(pdfPath, prevPath, page, true);
  const boxes = diff?.kind === 'boxes' ? diff.boxes : [];
  const noteIds = notes.map((n) => n.id).join(',');
  useEffect(() => {
    if (busy || !diff) { onResult(page, { busy: true, count: 0 }); return; }
    if (!boxes.length && !notes.length) { onResult(page, { busy: false, count: 0 }); return; }
    const key = `${pairKey}:${page}:${boxes.length}:${noteIds}`;
    const kept = keptChangeNames(key);
    if (kept) { onResult(page, { busy: false, count: boxes.length, result: kept }); return; }
    let live = true;
    onResult(page, { busy: true, count: boxes.length });
    nameChanges({ currentPath: pdfPath, previousPath: prevPath, page, boxes, notes })
      .then((result) => { keepChangeNames(key, result); if (live) onResult(page, { busy: false, count: boxes.length, result }); })
      .catch(() => { if (live) onResult(page, { busy: false, failed: true, count: boxes.length }); });
    return () => { live = false; };
  }, [busy, diff, pairKey, page, noteIds, attempt]);
  return null;
};

/** The named changes, page by page, in the panel. Says so while it is looking and when it could not. */
export const ChangesNamed: React.FC<{ byPage: Record<number, AiPage>; prevNo: number; pages: number; onRetry: () => void }> = ({ byPage, prevNo, pages, onRetry }) => {
  const list = (Object.entries(byPage) as [string, AiPage][]).map(([p, s]) => ({ page: Number(p), ...s })).sort((a, b) => a.page - b.page);
  const total = list.reduce((n, s) => n + s.count, 0);
  const busy = list.some((s) => s.busy);
  const failed = !busy && list.some((s) => s.failed);
  const named = list.flatMap((s) => Object.entries(s.result?.names || {}).map(([n, name]) => ({ page: s.page, n: Number(n), name })));
  if (!total && !busy) return null;
  return (
    <div className="hud-panel-in mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <div className="flex items-center gap-2 font-bold">
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
        <span className="min-w-0 flex-1">{busy ? `Looking at what changed since v${prevNo}` : `What changed since v${prevNo}`}</span>
        {!busy && <span className="text-xs font-semibold text-amber-800">Named by AI</span>}
      </div>
      {named.length > 0 && (
        <ol className="mt-1.5 flex flex-col gap-1" aria-label={`Changes since v${prevNo}`}>
          {named.map((c) => (
            <li key={`${c.page}:${c.n}`} className="hud-row-in flex items-start gap-2">
              <span className="mt-0.5 grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-amber-600 px-1 text-xs font-bold text-white">{c.n}</span>
              <span className="min-w-0 flex-1">{c.name}{pages > 1 && <span className="text-xs text-amber-800"> · page {c.page + 1}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {!busy && !failed && named.length > 0 && <p className="mt-1.5 text-xs text-amber-800">The numbers match the outlines on the drawing{list.some((s) => s.count > MAX_AI_CHANGES) ? `; only the first ${MAX_AI_CHANGES} on a page are named` : ''}. Check each one yourself.</p>}
      {failed && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-900">The changes are outlined on the drawing, but the AI could not name them just now.
          <button type="button" onClick={onRetry} className="min-h-[32px] font-bold underline">Try again</button>
        </p>
      )}
    </div>
  );
};

/** The AI's hint beside one of the last revision's notes. Nothing when it could not tell. */
export const VerdictHint: React.FC<{ hint?: { verdict: Verdict; why: string } }> = ({ hint }) => {
  if (!hint || hint.verdict === 'unsure') return null;
  return (
    <div className={cx('mt-1 inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold', hint.verdict === 'fixed' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
      <Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0">{VERDICT_LABEL[hint.verdict]}{hint.why ? `: ${hint.why}` : ''}</span>
    </div>
  );
};

/* ------------------------------------------------------------ 3. repeat-mistake alerts */

/**
 * The mistakes that keep coming back from the designer of the drawing being
 * checked. Reads their recent drawings' notes and asks once a day per
 * designer; what was found is remembered on this device for Home.
 */
export function useRepeats(orgId: string, on: boolean, designer: { email?: string | null; name?: string | null } | null | undefined, rows: ReviewDrawing[] | undefined, drawing: { projectId: string; id: string }): Repeat[] {
  const email = String(designer?.email || '').toLowerCase();
  const [repeats, setRepeats] = useState<Repeat[]>([]);
  const ready = on && !!email && !!rows?.length;
  useEffect(() => {
    setRepeats([]);
    if (!ready || !rows) return;
    const memo = freshMemo(orgId, email);
    if (memo) { setRepeats(memo.repeats); return; }
    const recent = recentDrawingsOf(rows, email, Date.now(), drawing);
    if (recent.length < 3) return;
    let live = true;
    loadPastNotes(orgId, recent).then((notes) => findRepeats(notes)).then((found) => {
      keepRepeats(orgId, { email, name: String(designer?.name || ''), at: Date.now(), repeats: found });
      if (live) setRepeats(found);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [orgId, ready, email, drawing.projectId, drawing.id]);
  return repeats;
}

/** Beside the drawing being checked: what this designer keeps being asked for. */
export const RepeatCard: React.FC<{ repeats: Repeat[]; designerName?: string | null; onUse?: (text: string) => void }> = ({ repeats, designerName, onUse }) => {
  if (!repeats.length) return null;
  return (
    <div className="hud-panel-in mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950" role="note" aria-label="Mistakes that keep coming back">
      <div className="flex items-center gap-2 font-bold"><Repeat2 size={15} aria-hidden /><span className="min-w-0 flex-1">Keeps coming back from {firstName(designerName)}</span><span className="text-xs font-semibold text-rose-800">Found by AI</span></div>
      <ul className="mt-1.5 flex flex-col gap-2">
        {repeats.map((r) => (
          <li key={r.title}>
            <b className="block">{r.title}</b>
            <span className="block text-xs text-rose-900">{repeatLine(designerName, r)}</span>
            {onUse && r.suggestion && <button type="button" onClick={() => onUse(r.suggestion)} className="mt-1 min-h-[36px] rounded-lg border border-rose-300 bg-white px-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100" title={`Starts a note: “${r.suggestion}”`}>Add it as a note</button>}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** What the device remembers about repeats, for Home's "Worth knowing". */
export const rememberedRepeats = (orgId: string): RepeatMemo[] => freshRepeats(keptRepeats(orgId));
