import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type Stored } from '../../lib/notify';
import { useInbox } from './NotifyContext';

/*
  A LIVE CHANGE, WHERE YOU ARE.

  When a note lands for the screen already open -- a check-in while People is
  in front of you, a client's reply inside their project -- this small chip
  turns in beside the page's title, glows once and says who did what. You are
  already looking at the right place, so it never needs the bar. It leaves on
  its own after a few seconds; the note stays in the bell.
*/

const SHOW_MS = 9000;

export default function LiveStamp({ match, className = '' }: { match: (n: Stored) => boolean; className?: string }) {
  const inbox = useInbox();
  const still = useReducedMotion();
  const [shown, setShown] = useState<Stored | null>(null);
  const latest = inbox?.latest || null;

  useEffect(() => {
    if (!latest || !match(latest)) return;
    setShown(latest);
    const t = window.setTimeout(() => setShown((s) => (s?.id === latest.id ? null : s)), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [latest?.id]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.button key={shown.id} type="button" onClick={() => inbox?.openNote(shown)}
          initial={still ? { opacity: 0 } : { opacity: 0, rotateX: -80, y: -4 }} animate={{ opacity: 1, rotateX: 0, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          style={{ transformPerspective: 500 }}
          title="Open it"
          className={`nt-live inline-flex items-center gap-2 max-w-[min(420px,70vw)] px-3 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:border-[#3D52A0]/40 ${className}`}>
          <span className="nt-live-dot" aria-hidden />
          <span className="truncate"><b className="font-bold text-slate-800">{shown.title}</b> · just now</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
