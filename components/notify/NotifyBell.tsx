import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, RotateCcw } from '@/lib/lucide-shim';
import { type Stored } from '../../lib/notify';
import { DoneTick, Glide, EASE } from '../people/PeopleBits';
import { useInbox, useNoteArrivals, type Folded } from './NotifyContext';
import { AlarmClock, BellGlyph, Count, Faces, NoteTile, SNOOZES, ago, titleOf } from './NotifyBits';

/*
  THE BELL: the one list of everything that reached you.

  Its count is the notes you have not read, and changes the moment a note
  lands; the bell gives one swing in 3D. The list opens like a card folding
  down, grouped by project, newest first, with a burst of check-ins folded
  into one row of faces. Each row opens the screen that owns it; Done and
  Snooze clear it here and on every other device, because the stamp lives on
  the note (services/inboxService.ts).
*/

type View = 'inbox' | 'done';

const groupName = (n: Stored) => n.projectName || (n.area === 'team' ? 'People' : n.kind.startsWith('lead.') ? 'Leads' : 'Studio');

function groups(list: (Folded | Stored)[]): { name: string; items: (Folded | Stored)[] }[] {
  const out: { name: string; items: (Folded | Stored)[] }[] = [];
  for (const n of list) {
    const name = groupName(n);
    let g = out.find((x) => x.name === name);
    if (!g) out.push((g = { name, items: [] }));
    g.items.push(n);
  }
  return out;
}

const rowV = {
  hidden: { opacity: 0, rotateX: -55, y: -6 },
  show: { opacity: 1, rotateX: 0, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.22, ease: EASE } },
};

const Row: React.FC<{ n: Folded | Stored; view: View; onOpen: () => void }> = ({ n, view, onOpen }) => {
  const inbox = useInbox()!;
  const [snoozing, setSnoozing] = useState(false);
  const members: Stored[] = (n as Folded).members || [n];
  const ids = members.map((m) => m.id);
  const unread = members.some((m) => !m.readAt);
  const needs = n.level === 'needs';
  return (
    <motion.li layout variants={rowV} exit="exit" style={{ transformPerspective: 700, transformOrigin: '50% 0%' }}
      className="group relative flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer outline-none focus-visible:bg-slate-50"
      tabIndex={0} role="button" aria-label={titleOf(n as Folded)}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <NoteTile note={n} size="sm" />
      <div className="min-w-0 flex-1 pr-14">
        <p className={`text-sm leading-snug ${unread ? 'font-bold text-slate-800' : 'font-semibold text-slate-700'}`}>
          {titleOf(n as Folded)}
          {needs && view === 'inbox' && <span className="nt-needs ml-1.5 align-[2px] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#3D52A0]/10 text-[#3D52A0]">Needs you</span>}
        </p>
        {n.line && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.line}</p>}
        {members.length > 1 && <Faces members={members} />}
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{[n.actor, ago(n.at)].filter(Boolean).join(' · ')}</p>
        {needs && view === 'inbox' && n.action && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="pp-press mt-2 px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">{n.action}</button>
        )}
      </div>
      {unread && view === 'inbox' && <span className="absolute right-4 top-4 w-2 h-2 rounded-full bg-[#3D52A0]" aria-hidden />}
      <div className="absolute right-3 top-8 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:opacity-100"
        onClick={(e) => e.stopPropagation()}>
        {view === 'inbox' ? (
          <>
            <button type="button" title="Done" aria-label="Mark done" onClick={() => inbox.done_(ids)}
              className="w-7 h-7 grid place-items-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors">
              <Check className="w-3.5 h-3.5" />
            </button>
            <span className="relative">
              <button type="button" title="Snooze" aria-label="Snooze" aria-expanded={snoozing} onClick={() => setSnoozing((v) => !v)}
                className="w-7 h-7 grid place-items-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-[#3D52A0] hover:border-[#3D52A0]/30 transition-colors">
                <AlarmClock className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {snoozing && (
                  <motion.span initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-8 z-10 w-48 p-1 rounded-xl bg-white border border-slate-200 shadow-lg flex flex-col">
                    {SNOOZES.map((s) => (
                      <button key={s.label} type="button" onClick={() => { setSnoozing(false); inbox.snooze(ids, s.until()); }}
                        className="text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">{s.label}</button>
                    ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </>
        ) : (
          <button type="button" title="Back to the inbox" aria-label="Back to the inbox" onClick={() => inbox.undo(ids)}
            className="w-7 h-7 grid place-items-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-[#3D52A0] transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.li>
  );
};

export default function NotifyBell({ className = '' }: { className?: string }) {
  const inbox = useInbox();
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('inbox');
  const [ringing, setRinging] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useNoteArrivals(() => true, () => {
    setRinging(false);
    requestAnimationFrame(() => setRinging(true));
    window.setTimeout(() => setRinging(false), 760);
  });

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 10, right: Math.max(8, window.innerWidth - r.right - 4) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); window.removeEventListener('resize', place); };
  }, [open]);

  if (!inbox) return null;
  const list = view === 'inbox' ? inbox.open : inbox.done.slice(0, 40);
  const open_ = (n: Folded | Stored) => {
    const members: Stored[] = (n as Folded).members || [n];
    if (members.length > 1) inbox.read(members.map((m) => m.id));
    inbox.openNote(n);
    setOpen(false);
  };

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={inbox.unread ? `Notifications, ${inbox.unread} unread` : 'Notifications'} title="Notifications"
        className={`relative w-10 h-10 shrink-0 grid place-items-center rounded-xl hover:bg-sky-50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${ringing ? 'nt-ring' : ''} ${className}`}>
        <BellGlyph />
        <Count needs={inbox.unread} className="top-0.5 right-0" label={`${inbox.unread} unread`} />
      </button>

      {open && at && createPortal(
        <motion.div ref={panel} role="dialog" aria-label="Notifications"
          initial={still ? false : { opacity: 0, rotateX: -16, y: -8, scale: 0.97 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{ top: at.top, right: at.right, transformPerspective: 1000, transformOrigin: 'top right' }}
          className="fixed z-[300] w-[min(400px,calc(100vw-16px))] max-h-[min(580px,calc(100vh-96px))] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Notifications</p>
                <p className="font-bold text-slate-800">For you</p>
              </div>
              <Glide id="nt-view" label="Show" value={view} onChange={setView}
                options={[{ id: 'inbox', label: inbox.open.length ? `Inbox ${inbox.open.length}` : 'Inbox' }, { id: 'done', label: 'Done' }]} />
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="inline-flex items-center gap-2 text-[11px] text-slate-500"><span className="nt-live-dot" />Live. Read here is read on every device</span>
              {view === 'inbox' && inbox.unread > 0 && (
                <button type="button" onClick={inbox.readAll} className="text-xs font-bold text-[#3D52A0] hover:underline shrink-0">Mark all read</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!list.length ? (
              <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
                <DoneTick size={44} />
                <p className="font-bold text-slate-800 mt-1">{view === 'inbox' ? 'All caught up' : 'Nothing done yet'}</p>
                <p className="text-xs text-slate-500">{view === 'inbox' ? 'New notes land here the moment they happen.' : 'What you mark done waits here, in case you need it back.'}</p>
              </div>
            ) : (
              groups(list).map((g) => (
                <div key={g.name}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between"><span>{g.name}</span><span>{g.items.length}</span></p>
                  <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }} className="divide-y divide-slate-100">
                    <AnimatePresence initial={false}>
                      {g.items.map((n) => <Row key={n.id} n={n} view={view} onOpen={() => open_(n)} />)}
                    </AnimatePresence>
                  </motion.ul>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
            Each note also counts on its tab. Someone waiting on you shows in red.
          </div>
        </motion.div>,
        document.body,
      )}
    </>
  );
}
