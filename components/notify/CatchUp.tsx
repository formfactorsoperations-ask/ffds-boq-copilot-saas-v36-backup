import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronRight, X } from '@/lib/lucide-shim';
import { isOpen, type NoteArea, type Stored } from '../../lib/notify';
import { DoneTick } from '../people/PeopleBits';
import { useInbox } from './NotifyContext';
import { NoteTile, ago } from './NotifyBits';

/*
  CATCH-UP AFTER TIME AWAY (pattern 14 in the round-two mockups).

  Back after four hours or more -- the next morning, after a site visit --
  with two or more notes still open since the last visit, one glass card
  says what happened while you were away, kind by kind, and then deals the
  ones where someone is waiting on you one at a time: answer it, mark it
  done, or skip to the next. The updates can be marked read in one go.
  Closing it leaves everything in the bell, as it was.

  "The last visit" is this browser's, kept per inbox: the last minute
  StudioDesk was open in front. It is never shown twice for the same absence.
*/

const AWAY_MS = 4 * 60 * 60 * 1000;
const SETTLE_MS = 1500;
const seenKey = (box: string) => `studiodesk.lastSeen.${box}`;
const readSeen = (box: string): number | null => {
  try { const v = Number(window.localStorage.getItem(seenKey(box))); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};
const writeSeen = (box: string, at: number) => { try { window.localStorage.setItem(seenKey(box), String(at)); } catch { /* private window */ } };

const AREA_LABEL: Record<NoteArea, (n: number) => string> = {
  clients: (n) => `${n} from clients`, team: (n) => `${n} from the team`, design: (n) => `${n} on the Design Desk`,
  site: (n) => `${n} from site`, money: (n) => `${n} on money`,
};

/** "3 from clients · 2 from the team", or for a client in their portal "2 waiting for you · 1 update". */
export function awaySummary(notes: Pick<Stored, 'area' | 'level'>[], client = false): string[] {
  if (client) {
    const needs = notes.filter((n) => n.level === 'needs').length, rest = notes.length - needs;
    return [needs ? `${needs} waiting for you` : '', rest ? `${rest} ${rest === 1 ? 'update' : 'updates'}` : ''].filter(Boolean);
  }
  const by = new Map<NoteArea, number>();
  notes.forEach((n) => by.set(n.area, (by.get(n.area) || 0) + 1));
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([area, n]) => (AREA_LABEL[area] || ((k: number) => `${k} more`))(n));
}

/** The notes that came in while away and are still open: the catch-up shows when there are two or more. */
export function sinceAway(notes: Stored[], lastSeen: number | null, now = Date.now()): Stored[] | null {
  if (!lastSeen || now - lastSeen < AWAY_MS) return null;
  const list = notes.filter((n) => n.at > lastSeen && isOpen(n, now));
  return list.length >= 2 ? list : null;
}

export default function CatchUp() {
  const inbox = useInbox();
  const still = useReducedMotion();
  const box = inbox?.box || null;
  const [away, setAway] = useState<{ since: number; ids: string[] } | null>(null);
  const [step, setStep] = useState(0);
  const [ticked, setTicked] = useState<string | null>(null);
  const checked = useRef<string | null>(null);
  /* Bumped when StudioDesk comes back to the front after hours hidden, to look again. */
  const [wake, setWake] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  const notes = useMemo(() => {
    if (!inbox) return [] as Stored[];
    return [...inbox.waiting, ...inbox.open.flatMap((f) => f.members || [f])]
      .filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i);
  }, [inbox?.waiting, inbox?.open]);

  const notesRef = useRef(notes);
  notesRef.current = notes;
  /* Once the inbox has answered and settled (a first answer can come from the cache, short): was this person away long enough, and did enough happen? */
  useEffect(() => {
    const key = `${box}:${wake}`;
    if (!box || !inbox?.ready || checked.current === key) return;
    checked.current = key;
    const last = readSeen(box);
    const t = window.setTimeout(() => {
      const list = sinceAway(notesRef.current, last);
      if (list && last) { setStep(0); setAway({ since: last, ids: list.map((n) => n.id) }); }
      writeSeen(box, Date.now());
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [box, inbox?.ready, wake]);

  /* While StudioDesk is in front, this is a visit: keep the stamp current. A tab left hidden for hours counts as away too. */
  useEffect(() => {
    if (!box) return;
    const tick = () => { if (document.visibilityState === 'visible') writeSeen(box, Date.now()); };
    const t = window.setInterval(tick, 60000);
    const vis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); writeSeen(box, Date.now()); return; }
      const was = hiddenAt.current;
      hiddenAt.current = null;
      if (was && Date.now() - was >= AWAY_MS) setWake((w) => w + 1);
    };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [box]);

  useEffect(() => {
    if (!ticked || !inbox) return;
    /* Done takes it off the list, so the next one moves into its place. */
    const t = window.setTimeout(() => { inbox.done_([ticked]); setTicked(null); }, 650);
    return () => window.clearTimeout(t);
  }, [ticked]);

  useEffect(() => {
    if (!away) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAway(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [away]);

  if (!inbox || !away || typeof document === 'undefined') return null;
  const all = notes.filter((n) => away.ids.includes(n.id));
  const needs = all.filter((n) => n.level === 'needs' && isOpen(n)).sort((a, b) => a.at - b.at);
  const updates = all.filter((n) => n.level !== 'needs' && !n.readAt);
  const current: Stored | undefined = needs[step] || needs.find((n) => n.id === ticked);
  const close = () => setAway(null);
  const client = inbox.audience === 'client';

  return createPortal(
    <div className="fixed inset-0 z-[290] flex items-center justify-center p-4" role="dialog" aria-label="While you were away">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={close} />
      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 30, rotateX: 28, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{ transformPerspective: 1200, transformOrigin: '50% 100%' }}
        className="relative w-full max-w-lg">
        <div className="nt-glass relative overflow-hidden rounded-3xl p-5">
          <span className="nt-orb nt-orb-a" aria-hidden />
          <span className="nt-orb nt-orb-b" aria-hidden />
          <span className="nt-sheen" aria-hidden />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">While you were away</p>
              <h3 className="font-bold text-slate-800 mt-1">{all.length} new since {new Date(away.since).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {awaySummary(all, client).map((line, i) => (
                  <span key={line} className="hud-row-in px-2.5 py-1 rounded-full bg-white/70 border border-white text-[11px] font-bold text-slate-600" style={{ animationDelay: `${120 + i * 50}ms` }}>{line}</span>
                ))}
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close. Everything stays in the bell" title="Close. Everything stays in the bell"
              className="shrink-0 p-2 rounded-xl text-slate-500 hover:bg-white/70"><X className="w-4 h-4" /></button>
          </div>

          <div className="relative mt-4" style={{ perspective: 1000 }}>
            {needs.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{client ? 'Waiting for you' : 'Waiting on you'}, oldest first</p>
                <span className="flex gap-1" aria-label={`${Math.min(step + 1, needs.length)} of ${needs.length}`}>
                  {needs.map((n, i) => (
                    <span key={n.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-4 bg-[#3D52A0]' : i < step ? 'w-1.5 bg-[#3D52A0]/40' : 'w-1.5 bg-slate-300'}`} />
                  ))}
                </span>
              </div>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {current ? (
                <motion.div key={current.id}
                  initial={still ? { opacity: 0 } : { opacity: 0, rotateY: -70, x: 30 }}
                  animate={{ opacity: 1, rotateY: 0, x: 0 }}
                  exit={still ? { opacity: 0 } : { opacity: 0, rotateY: 70, x: -30, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                  className="rounded-2xl bg-white/80 border border-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    {ticked === current.id ? <DoneTick size={40} /> : <NoteTile note={current} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{current.title}</p>
                      {current.line && <p className="text-xs text-slate-500 mt-0.5">{current.line}</p>}
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{[current.projectName, current.actor, ago(current.at)].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
                    {step < needs.length - 1 && (
                      <button type="button" onClick={() => setStep((s) => s + 1)}
                        className="inline-flex items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800">Skip<ChevronRight className="w-3.5 h-3.5" /></button>
                    )}
                    <button type="button" onClick={() => setTicked(current.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"><Check className="w-3.5 h-3.5" />Done</button>
                    <button type="button" onClick={() => { inbox.openNote(current); close(); }}
                      className="pp-press px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">{current.action || 'Open'}</button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="clear" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl bg-white/80 border border-white p-4 flex items-center gap-3">
                  <DoneTick size={36} />
                  <p className="text-sm text-slate-600">{needs.length ? 'That is everything waiting on you.' : 'Nobody is waiting on you. The rest are updates.'}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative flex items-center justify-between gap-3 mt-4">
            <span className="text-[11px] text-slate-500">{updates.length ? `${updates.length} ${updates.length === 1 ? 'update' : 'updates'} to read, in the bell` : 'Everything is also in the bell.'}</span>
            <span className="flex items-center gap-2">
              {updates.length > 0 && (
                <button type="button" onClick={() => inbox.read(updates.map((n) => n.id))}
                  className="text-xs font-bold text-[#3D52A0] hover:underline">Mark the updates read</button>
              )}
              <button type="button" onClick={close} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">{needs.length && current ? 'Later' : 'Done'}</button>
            </span>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
