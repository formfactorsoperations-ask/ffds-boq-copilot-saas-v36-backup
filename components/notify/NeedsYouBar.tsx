import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Check, X, ChevronRight } from '@/lib/lucide-shim';
import { DoneTick } from '../people/PeopleBits';
import { useInbox } from './NotifyContext';
import { NoteTile, ago } from './NotifyBits';

/*
  THE "NEEDS YOU" BAR: the only note that interrupts.

  When someone is waiting on you -- a client's message, a leave request, a
  blocked site -- one frosted-glass bar rises at the bottom of the screen with
  the answer button in it. A newer one replaces it at once (it turns over in
  3D); the rest wait behind "Next". Plain updates never show here: they count
  on their tab and in the bell.

  It never takes the keyboard or covers the middle of the page, and it stays
  until it is answered, marked done, or closed. Closing keeps it in the bell.
*/

/*
  The bar leans toward the pointer in 3D. Not People's Tilt: that keeps its
  children in 3D (preserve-3d), and inside a 3D context Chromium drops the
  backdrop blur, so the glass turned clear and the page read through it.
*/
const GlassTilt: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const still = useReducedMotion();
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [5, -5]), { stiffness: 220, damping: 22 });
  const ry = useSpring(useTransform(x, [0, 1], [-5, 5]), { stiffness: 220, damping: 22 });
  if (still) return <>{children}</>;
  return (
    <motion.div style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}>
      {children}
    </motion.div>
  );
};

export default function NeedsYouBar() {
  const inbox = useInbox();
  const still = useReducedMotion();
  const [ticked, setTicked] = useState<string | null>(null);
  const top = inbox?.arrivals[0] || null;
  const more = Math.max(0, (inbox?.arrivals.length || 0) - 1);

  useEffect(() => {
    if (!ticked || !inbox) return;
    const t = window.setTimeout(() => { inbox.done_([ticked]); setTicked(null); }, 700);
    return () => window.clearTimeout(t);
  }, [ticked]);

  if (!inbox || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[260] flex justify-center px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {top && (
          <motion.div key={top.id}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 46, rotateX: 62, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 18, rotateX: -48, scale: 0.96, transition: { duration: 0.24 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{ transformPerspective: 1100, transformOrigin: '50% 100%' }}
            className="pointer-events-auto w-full max-w-[680px]">
            <GlassTilt>
              <div role="status" aria-live="polite" aria-label={`Needs you: ${top.title}`}
                className="nt-glass relative overflow-hidden rounded-[22px] pl-3 pr-2 py-3 sm:pl-4 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
                <span className="nt-orb nt-orb-a" aria-hidden />
                <span className="nt-orb nt-orb-b" aria-hidden />
                <span className="nt-sheen" aria-hidden />

                <span className="relative">
                  {ticked === top.id ? <DoneTick size={40} /> : <NoteTile note={top} />}
                </span>

                <div className="relative min-w-0 flex-1 basis-[calc(100%-64px)] sm:basis-auto">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0] truncate">
                    {ticked === top.id ? 'Done' : 'Needs you'}{top.projectName ? ` · ${top.projectName}` : ''}
                  </p>
                  <p className="text-sm font-bold text-slate-800 truncate">{top.title}</p>
                  {top.line && <p className="hidden sm:block text-xs text-slate-500 truncate">{top.line} · {ago(top.at)}</p>}
                </div>

                <div className="relative flex items-center gap-2 w-full sm:w-auto justify-end">
                {more > 0 && (
                  <button type="button" onClick={() => inbox.dismiss(top.id)} title="Show the next one"
                    className="relative inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-white/70 border border-white text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-white">
                    Next {more}<ChevronRight className="w-3 h-3" />
                  </button>
                )}
                <button type="button" onClick={() => inbox.openNote(top)}
                  className="pp-press relative shrink-0 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
                  {top.action || 'Open'}
                </button>
                <button type="button" onClick={() => setTicked(top.id)} title="Mark done" aria-label="Mark done"
                  className="relative shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white/70 border border-white text-slate-500 hover:text-emerald-600 hover:bg-white transition-colors">
                  <Check className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => inbox.dismiss(top.id)} title="Close. It stays in the bell" aria-label="Close. It stays in the bell"
                  className="relative shrink-0 w-8 h-9 grid place-items-center rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
                </div>
              </div>
            </GlassTilt>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
