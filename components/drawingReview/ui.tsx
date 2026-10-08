import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fileUrl } from '../../services/drawingReviewService';
import type { ReviewSummary } from '../../lib/drawingReview';
import { dueOf, roundWarn, INCLUDED_ROUNDS } from '../../lib/designDesk';

/*
  Shared pieces of the Design Desk screens: the mark colours, dates and
  names, the stored preview, and a small toast. Colours are written out in
  full rather than as Tailwind arbitrary values with commas, which fail
  without a word.
*/

export const INK = '#14211E';
export const TABLE = '#1A2120';
export const MARK = '#F0506E';
export const FIXED = '#3FBF94';
/** The client's own changes, from a design meeting. */
export const CLIENT = '#C77A1A';

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

export { dueOf, dueRank, roundWarn, INCLUDED_ROUNDS, type Due } from '../../lib/designDesk';
const DUE_TONE = { late: 'bg-[#FBE9EF] text-[#C2416A]', soon: 'bg-[#FBF0E1] text-[#B4690E]', week: 'bg-[#ECECFC] text-[#3D52A0]', later: 'bg-[#ECF0ED] text-[#66786F]' };
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
