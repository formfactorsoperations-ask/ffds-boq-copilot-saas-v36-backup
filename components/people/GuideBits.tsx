import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy } from '@/lib/lucide-shim';
import { EASE, initials } from './PeopleBits';

/*
  Small pieces shared by the office guide's sections (lib/peopleGuide.ts):
  team names, how days read, a copy button that ticks, and a face.
*/

export const TEAM_LABEL: Record<string, string> = {
  leadership: 'Leadership', design: 'Design', site: 'Site', 'client-relations': 'Client relations', ops: 'Operations', studio: 'Studio',
};
export const chip = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "10-22" reads "22 Oct". */
export const monthDay = (md: string) => (/^\d{2}-\d{2}$/.test(md) ? `${Number(md.slice(3))} ${MONTHS[Number(md.slice(0, 2)) - 1]}` : '');
/** "2026-10-22" reads "Thu, 22 Oct". */
export const niceDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
/** "2022-06-04" reads "4 June 2022". */
export const longDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
export const fromNow = (days: number) =>
  days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : days > 0 ? `In ${days} days` : `${-days} days ago`;
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const firstName = (name: string) => name.split(/\s+/)[0] || name;

/** Copy a number or an address; the button ticks for a moment. */
export function CopyButton({ text, label, quiet = false }: { text: string; label: string; quiet?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(false), 1600); return () => window.clearTimeout(t); }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* a browser that will not copy: nothing to tick */ }
  };
  return (
    <span className={`inline-flex ${quiet && !copied ? 'opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity' : ''}`}>
    <AnimatePresence mode="wait" initial={false}>
      {copied ? (
        <motion.span key="done" role="status" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
          className={`${chip} inline-flex items-center gap-1 bg-emerald-100 text-emerald-700`}>
          <svg className="pp-tick w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Copied
        </motion.span>
      ) : (
        <motion.button key="copy" type="button" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:bg-[#3D52A0]/10 hover:text-[#3D52A0] transition-colors`}>
          <Copy className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </AnimatePresence>
    </span>
  );
}

/** A person's initials in a tile: filled in the brand while they are in. */
export const Face: React.FC<{ name: string; here?: boolean; live?: boolean; size?: 'sm' | 'md' | 'lg' }> = ({ name, here = false, live = false, size = 'md' }) => {
  const box = size === 'lg' ? 'w-16 h-16 rounded-2xl text-sm' : size === 'sm' ? 'w-8 h-8 rounded-lg text-[11px]' : 'w-10 h-10 rounded-xl text-xs';
  return (
    <span className="relative inline-flex shrink-0">
      <span className={`${box} grid place-items-center font-black ${here ? 'bg-[#3D52A0] text-white shadow-[0_10px_18px_-12px_rgba(61,82,160,0.7)]' : 'bg-[#3D52A0]/10 text-[#3D52A0]'}`}>{initials(name)}</span>
      {live && <span className="absolute -top-1 -right-1 pp-live inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />}
    </span>
  );
};

