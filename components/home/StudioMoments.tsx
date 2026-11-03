import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cake, Star, HandHeart, X } from '@/lib/lucide-shim';
import type { GuideView } from '../../lib/peopleGuide';
import { momentsOf, type Moment } from '../../lib/peopleMoments';
import { markPlayed, playedMoments } from '../../services/peopleGuideService';
import { ConfettiShower, IconTile } from '../people/PeopleBits';

/*
  MOMENTS ON HOME (lib/peopleMoments.ts; the owner, 3 Nov 2026): a new
  thank-you, or a birthday or work anniversary today, drops in at the top of
  Home as a glass card under a shower of confetti, so it is seen even when the
  Studio life pin is further down. One at a time, each once for each person,
  gone by itself after a few seconds; its button opens the right part of People.
*/

const SHOW_MS = 8000;
const ICON = { kudos: HandHeart, birthday: Cake, anniversary: Star } as const;
const EYEBROW = { kudos: 'Kudos', birthday: 'Birthday today', anniversary: 'Work anniversary today' } as const;

export default function StudioMoments({ view, meId, onOpen }: { view: GuideView | null; meId: string; onOpen: (section: 'kudos' | 'celebrations') => void }) {
  const [queue, setQueue] = useState<Moment[]>([]);
  useEffect(() => {
    if (!view || !meId) return;
    const fresh = momentsOf(view, meId, playedMoments(meId, 'home'));
    if (!fresh.length) return;
    /* Remembered as soon as it is queued: it plays once, even if the page is left before it shows. */
    markPlayed(meId, 'home', fresh.flatMap((m) => m.ids));
    setQueue((q) => [...q, ...fresh.filter((m) => !q.some((x) => x.id === m.id))].slice(0, 5));
  }, [view, meId]);
  const now = queue[0];
  useEffect(() => {
    if (!now) return;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [now?.id]);
  const next = () => setQueue((q) => q.slice(1));

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[240] w-[min(480px,calc(100vw-2rem))] pointer-events-none" aria-live="polite">
      <AnimatePresence mode="wait">
        {now && (
          <motion.section key={now.id} role="status"
            initial={{ opacity: 0, y: -40, scale: 0.9, rotateX: -30 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -24, scale: 0.96, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }} style={{ transformPerspective: 900 }}
            className="group pointer-events-auto relative rounded-3xl pp-glass px-5 py-4">
            <span className="pp-glow" />
            <ConfettiShower key={now.id} />
            <div className="relative flex items-start gap-3">
              <motion.span initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: [0, -12, 10, 0], scale: 1 }} transition={{ duration: 0.9, delay: 0.15 }}>
                <IconTile icon={ICON[now.kind]} tone={now.kind === 'kudos' ? 'brand' : 'ok'} size="lg" />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${now.kind === 'kudos' ? 'text-[#3D52A0]' : 'text-emerald-700'}`}>
                  {EYEBROW[now.kind]}{queue.length > 1 ? ` · 1 of ${queue.length}` : ''}
                </p>
                <p className="font-bold text-slate-800 mt-0.5">{now.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{now.line}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button type="button" onClick={() => { next(); onOpen(now.section); }}
                    className="pp-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">
                    {now.kind === 'kudos' ? 'See the kudos wall' : now.mine ? 'Open your card' : now.signed ? 'See the card' : 'Sign the card'}
                  </button>
                  <button type="button" onClick={next} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-white/70">
                    {queue.length > 1 ? 'Next' : 'Later'}
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => setQueue([])} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-white/70 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
