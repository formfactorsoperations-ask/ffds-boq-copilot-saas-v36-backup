import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import { fileUrl, type ReviewDrawing } from '../../services/drawingReviewService';
import { laneOf, stateOf, guessAudience, type DeskLane, type ReviewSummary } from '../../lib/drawingReview';

/*
  Shared pieces of the Design Review screens: the lane colours, the sheet
  card, the stored preview, and a small toast. Colours are written out in
  full rather than as Tailwind arbitrary values with commas, which fail
  without a word.
*/

export const LANE = {
  desk: { label: 'On your desk', ink: '#B4690E', soft: '#FBF0E1', step: 0 },
  review: { label: 'With the Design Head', ink: '#5B5BD6', soft: '#ECECFC', step: 1 },
  approved: { label: 'Approved', ink: '#2E8B6F', soft: '#E1F1EA', step: 2 },
} as const satisfies Record<DeskLane, { label: string; ink: string; soft: string; step: number }>;

export const INK = '#14211E';
export const TABLE = '#1A2120';
export const MARK = '#F0506E';
export const FIXED = '#3FBF94';

export const roomLabel = (r?: string | null) => (!r || r === 'General / Project-Wide' ? 'Whole home' : r);

export const ago = (t?: number | null) => {
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.round(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} h ago`;
  return `${Math.round(d / 86_400_000)} d ago`;
};
export const shortDate = (t?: number | null) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const firstName = (n?: string | null) => String(n || '').split(/[\s@]/)[0] || 'Someone';

/*
  How close a drawing is to its target date. `rank` sorts the urgent first:
  0 overdue, 1 due within 3 days, 2 within a week, 3 later, 4 no date.
*/
export type Due = { rank: number; label: string; tone: 'late' | 'soon' | 'week' | 'later' } | null;
export function dueOf(targetDate?: string | null): Due {
  if (!targetDate) return null;
  const t = new Date(targetDate);
  if (Number.isNaN(t.getTime())) return null;
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(t) - day(new Date())) / 86_400_000);
  const date = t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days < 0) return { rank: 0, tone: 'late', label: `Overdue ${-days} d` };
  if (days === 0) return { rank: 1, tone: 'soon', label: 'Due today' };
  if (days === 1) return { rank: 1, tone: 'soon', label: 'Due tomorrow' };
  if (days <= 3) return { rank: 1, tone: 'soon', label: `Due ${t.toLocaleDateString('en-IN', { weekday: 'short' })}` };
  if (days <= 7) return { rank: 2, tone: 'week', label: `Due ${t.toLocaleDateString('en-IN', { weekday: 'short' })} ${date}` };
  return { rank: 3, tone: 'later', label: `Due ${date}` };
}
export const dueRank = (d: { targetDate?: string }) => dueOf(d.targetDate)?.rank ?? 4;
const DUE_TONE = { late: 'bg-[#FBE9EF] text-[#C2416A]', soon: 'bg-[#FBF0E1] text-[#B4690E]', week: 'bg-[#ECECFC] text-[#3D52A0]', later: 'bg-[#ECF0ED] text-[#66786F]' };
/*
  REVISION WATCH. Each send to the Design Head opens a review round; the
  studio's terms include two, so a sheet on its third round or later is
  flagged before the extra rounds turn into chargeable revisions. A sheet
  that came back is about to start its next round, so it counts that one.
*/
export const INCLUDED_ROUNDS = 2;
export function roundWarn(r?: ReviewSummary | null): number {
  if (!r || r.state === 'APPROVED') return 0;
  const round = (r.attempts || 0) + (r.state === 'CHANGES_REQUESTED' ? 1 : 0);
  return round > INCLUDED_ROUNDS ? round : 0;
}
const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
export function roundWarnText(r?: ReviewSummary | null): string {
  const round = roundWarn(r);
  if (!round) return '';
  return r!.state === 'CHANGES_REQUESTED' ? `Heading into ${nth(round)} round` : `${nth(round)} round`;
}
export function RoundChip({ r }: { r?: ReviewSummary | null }) {
  const text = roundWarnText(r);
  return text ? (
    <span title={`${INCLUDED_ROUNDS} review rounds are included. Further rounds may count as chargeable revisions.`}
      className="inline-flex rounded-full bg-[#FBE9EF] px-2 py-0.5 text-[11px] font-bold text-[#C2416A]">{text}</span>
  ) : null;
}

export function DueChip({ targetDate }: { targetDate?: string | null }) {
  const due = dueOf(targetDate);
  return due ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${DUE_TONE[due.tone]}`}>{due.label}</span> : null;
}

export function Initials({ name, color = '#5B5BD6', size = 24 }: { name?: string | null; color?: string; size?: number }) {
  const ini = String(name || '?').split(/[\s@._]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  return (
    <span className="inline-grid place-items-center rounded-full font-extrabold text-white shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color }} title={name || ''}>{ini}</span>
  );
}

/** The stored preview of a version, fetched through the rules. */
export function Thumb({ path, className = '' }: { path?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) fileUrl(path).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => { live = false; };
  }, [path]);
  if (!url) return <div className={`bg-[#FBFAF6] ${className}`} />;
  return <img src={url} alt="" className={`object-cover object-top bg-white ${className}`} draggable={false} />;
}

/** What one line on a card should say about where the sheet is. */
export function storyOf(d: ReviewDrawing, me?: string | null): string {
  const r = d.review;
  switch (stateOf(r)) {
    case 'NONE': return 'No sheet yet';
    case 'DRAFT': return `v${r!.versionNo} is ready to send`;
    case 'IN_REVIEW': return `v${r!.versionNo} with the Design Head · sent ${ago(r!.submittedAt)}`;
    case 'CHANGES_REQUESTED': {
      const who = r!.decidedBy?.email === me ? 'You' : firstName(r!.decidedBy?.name);
      return r!.marksTotal ? `${who} left ${r!.marksTotal} note${r!.marksTotal === 1 ? '' : 's'} · ${ago(r!.decidedAt)}` : `Returned by ${who} · ${ago(r!.decidedAt)}`;
    }
    case 'APPROVED': return r!.selfApproved ? `v${r!.versionNo} self-approved ${shortDate(r!.decidedAt)}` : `v${r!.versionNo} approved by ${firstName(r!.decidedBy?.name)} · ${shortDate(r!.decidedAt)}`;
  }
}

export function Journey({ lane }: { lane: DeskLane }) {
  const L = LANE[lane];
  return (
    <div className="grid grid-cols-3 gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className="h-[3px] rounded-full" style={{ background: i < L.step ? `${L.ink}66` : i === L.step ? L.ink : '#E1E7E3' }} />
      ))}
    </div>
  );
}

interface CardProps {
  d: ReviewDrawing;
  me?: string | null;
  projectName?: string;
  dim?: boolean;
  draggable?: boolean;
  onOpen: () => void;
  action?: React.ReactNode;
  extra?: React.ReactNode;
}

export const SheetCard: React.FC<CardProps> = ({ d, me, projectName, dim, draggable, onOpen, action, extra }) => {
  const lane = laneOf(d.review);
  const L = LANE[lane];
  const r = d.review;
  const versions = r?.versionNo || 0;
  const audience = r?.audience || guessAudience(d.name);
  const returned = stateOf(r) === 'CHANGES_REQUESTED';
  return (
    <article
      className={`group relative flex flex-col rounded-2xl border bg-white text-left transition duration-300 hover:-translate-y-0.5 ${dim ? 'opacity-35 hover:opacity-80' : ''} ${draggable ? 'cursor-grab' : ''}`}
      style={{ borderColor: '#E1E7E3', boxShadow: '0 1px 2px rgba(20,33,30,.06)' }}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/drawing', `${d.projectId}/${d.id}`); e.dataTransfer.effectAllowed = 'move'; }}
    >
      <button type="button" onClick={onOpen} className="relative mx-3 mt-3 block aspect-[1.414/1] text-left focus-visible:outline-2" aria-label={`Open ${d.name}`}>
        {versions > 2 && <span className="absolute inset-0 rounded bg-[#FBFAF6] transition-transform duration-300 group-hover:translate-x-4 group-hover:-translate-y-2 group-hover:rotate-6" style={{ transform: 'translate(8px,-7px) rotate(2.4deg)', boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }} />}
        {versions > 1 && <span className="absolute inset-0 rounded bg-[#FBFAF6] transition-transform duration-300 group-hover:translate-x-2 group-hover:-translate-y-1.5 group-hover:rotate-3" style={{ transform: 'translate(4px,-4px) rotate(1.2deg)', boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }} />}
        {r?.versionId ? (
          <span className="absolute inset-0 overflow-hidden rounded bg-white" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.08)' }}>
            {r.thumbPath ? <Thumb path={r.thumbPath} className="h-full w-full" /> : <span className="grid h-full w-full place-items-center text-xs text-slate-400">v{r.versionNo} · PDF</span>}
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center rounded border-[1.5px] border-dashed text-center text-xs text-slate-500"
            style={{ borderColor: `${L.ink}80`, background: `repeating-linear-gradient(-45deg, transparent 0 8px, ${L.ink}12 8px 9px)` }}>
            Drop the first PDF<br />to start this sheet
          </span>
        )}
        {r?.versionId && <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-[#14211E] px-1.5 font-mono text-[10px] font-semibold text-white">v{r.versionNo}</span>}
        {audience === 'studio' && <span className="absolute bottom-1.5 left-1.5 z-10 rounded-md bg-[#FBF0E1] px-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#B4690E]">Studio only</span>}
        {returned && r!.marksTotal > 0 && (
          <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full px-2 text-[10.5px] font-extrabold text-white" style={{ background: r!.marksOpen ? MARK : FIXED }}>
            <MessageSquare size={10} />{r!.marksOpen || <Check size={11} />}
          </span>
        )}
      </button>
      {lane !== 'desk' && r?.attempts === 1 && stateOf(r) === 'APPROVED' && (
        <span className="absolute -right-1.5 -top-2 z-20 rotate-3 rounded-md bg-[#2E8B6F] px-2 py-0.5 text-[10.5px] font-extrabold text-white shadow">First-time approval</span>
      )}
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-extrabold text-[#14211E]">
          <span className="truncate">{d.name}</span>
          {d.priority === 'high' && <span className="rounded-full bg-[#FBE9EF] px-1.5 text-[10px] font-bold text-[#C2416A]">High</span>}
        </div>
        <div className="truncate text-[11.5px] text-[#66786F]">{projectName ? `${projectName} · ` : ''}{roomLabel(d.roomName)}</div>
        <div className="text-[12.5px] text-[#2A3B37]">{storyOf(d, me)}</div>
        {extra}
        <Journey lane={lane} />
        {lane !== 'approved' && (d.targetDate || roundWarn(r)) && (
          <div className="flex flex-wrap gap-1.5"><DueChip targetDate={d.targetDate} /><RoundChip r={r} /></div>
        )}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </article>
  );
};

/* ------------------------------------------------------------- toasts */

type Toast = { id: number; title: string; sub?: string; ok?: boolean };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2" style={{ width: 'min(440px, calc(100vw - 32px))' }} aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className="dr-pop flex w-full items-start gap-2.5 rounded-2xl bg-[#14211E] px-4 py-3 text-[13px] font-bold text-white" style={{ boxShadow: '0 20px 40px -16px rgba(0,0,0,.5)' }}>
            {t.ok && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#3FBF94]"><Check size={12} /></span>}
            <div>{t.title}{t.sub && <small className="mt-0.5 block font-medium opacity-75">{t.sub}</small>}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Entrance animations for these screens, as CSS (a framer exit inside a tab stalls the app's tab transitions). */
export const ReviewStyles = () => (
  <style>{`
    @keyframes drPop { from { transform: translateY(10px) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
    @keyframes drSlide { from { transform: translateX(40px); opacity: .3 } to { transform: none; opacity: 1 } }
    @keyframes drBreathe { 50% { transform: scale(1.02) } }
    .dr-pop { animation: drPop .35s cubic-bezier(.2,.9,.25,1.15) both }
    .dr-slide { animation: drSlide .35s cubic-bezier(.2,.7,.2,1) both }
    .dr-breathe { animation: drBreathe 1.6s ease-in-out infinite }
    .dr-studio { display: grid; grid-template-columns: minmax(0, 1fr) }
    @media (min-width: 1024px) { .dr-studio { grid-template-columns: minmax(0, 1fr) 360px } }
    .dr-note { display: grid; grid-template-columns: 24px minmax(0, 1fr) }
    @media (prefers-reduced-motion: reduce) { .dr-pop, .dr-slide, .dr-breathe { animation: none } }
  `}</style>
);
