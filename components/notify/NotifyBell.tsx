import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Monitor, RotateCcw, SlidersHorizontal, X } from '@/lib/lucide-shim';
import { type Stored } from '../../lib/notify';
import type { HubAlert } from '../../lib/hubAlerts';
import { DoneTick, Glide, EASE } from '../people/PeopleBits';
import { useInbox, useNoteArrivals, type Folded } from './NotifyContext';
import { AlarmClock, BellGlyph, Count, Faces, NoteCoin, SNOOZES, TICK_MS, ago, titleOf } from './NotifyBits';
import NotifySettings from './NotifySettings';
import { askDesktop, desktopPermission } from './notifyChannels';

/* The offer of desktop alerts, once per browser until it is answered. */
const OFFER_KEY = 'studiodesk.desktopOffer';
const offered = () => { try { return window.localStorage.getItem(OFFER_KEY) === 'done'; } catch { return true; } };
const markOffered = () => { try { window.localStorage.setItem(OFFER_KEY, 'done'); } catch { /* private window */ } };

/*
  THE BELL: the one list of everything that reached you.

  Its rose number is who is waiting on you, and stays until each is done, by
  you or by the server when the thing itself is dealt with; with nobody
  waiting, a dot says there is something new to read. Both change the moment
  a note lands, and the bell gives one swing in 3D; while someone waits it
  sways now and then. The list opens like a card folding down: what waits on
  you first, longest wait first, then the rest by project, newest first, with
  a burst of check-ins folded into one row of faces. Each row opens the place
  where it is dealt with; Done turns its tile over to a tick and it leaves;
  Done and Snooze clear it here and on every other device, because the stamp
  lives on the note (services/inboxService.ts).
*/

type View = 'inbox' | 'done';

/**
 * Inside a project, what that project is waiting on (components/ops/useHubAlerts):
 * the bell's first section, "On this project", counted on the bell. They lead to
 * the screen that owns each one and send nothing.
 */
export interface ProjectAlerts {
  name: string;
  alerts: HubAlert[];
  onGo: (route: string) => void;
  onDismiss: (id: string) => void;
}

const ALERT_TONE: Record<string, string> = {
  portal: 'bg-rose-50 text-rose-700 border-rose-100',
  client: 'bg-amber-50 text-amber-800 border-amber-100',
  money: 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/20',
};

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
  /* Done: the tile turns over to a tick, then the row leaves. */
  const [ticked, setTicked] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const finish = () => {
    if (ticked) return;
    setTicked(true);
    timer.current = window.setTimeout(() => inbox.done_(ids), TICK_MS);
  };
  return (
    <motion.li layout variants={rowV} exit="exit" style={{ transformPerspective: 700, transformOrigin: '50% 0%' }}
      className={`nt-row group relative flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer outline-none focus-visible:bg-slate-50 ${needs && view === 'inbox' ? 'nt-edge' : ''}`}
      tabIndex={0} role="button" aria-label={titleOf(n as Folded)}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <NoteCoin note={n} done={ticked} />
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
            <button type="button" title="Done" aria-label="Mark done" onClick={finish}
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

export default function NotifyBell({ className = '', project }: { className?: string; project?: ProjectAlerts }) {
  const inbox = useInbox();
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('inbox');
  const [ringing, setRinging] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const [offer, setOffer] = useState(() => desktopPermission() === 'default' && !offered());
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const ring = () => {
    setRinging(false);
    requestAnimationFrame(() => setRinging(true));
    window.setTimeout(() => setRinging(false), 760);
  };
  useNoteArrivals(() => true, ring);
  /* And when something new turns up on this project, never on a re-render. */
  const alertKey = (project?.alerts || []).map((a) => a.id).join('|');
  const knownAlerts = useRef<string | null>(null);
  useEffect(() => {
    if (knownAlerts.current !== null && alertKey && alertKey !== knownAlerts.current) ring();
    knownAlerts.current = alertKey;
  }, [alertKey]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Under the bell, but never past either edge: on a phone the bell may sit well in from the right. */
    const width = Math.min(400, window.innerWidth - 16);
    setAt({ top: r.bottom + 10, right: Math.min(Math.max(8, window.innerWidth - r.right - 4), window.innerWidth - width - 8) });
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
  const alerts = view === 'inbox' ? project?.alerts || [] : [];
  const waiting = project?.alerts.length || 0;
  /* The rose number: who is waiting on you, and what this project is waiting on. Reading a note does not lower it; doing it does. */
  const count = inbox.needs + waiting;
  /* In the inbox, what waits on you comes first, longest wait first; the rest stay by project. */
  const asking = view === 'inbox' ? [...list].filter((n) => n.level === 'needs').sort((a, b) => a.at - b.at) : [];
  const rest = view === 'inbox' ? list.filter((n) => n.level !== 'needs') : list;
  const headline = count ? 'waiting on you' : inbox.news ? 'new for you' : 'All caught up';
  const open_ = (n: Folded | Stored) => {
    const members: Stored[] = (n as Folded).members || [n];
    if (members.length > 1) inbox.read(members.map((m) => m.id));
    inbox.openNote(n);
    setOpen(false);
  };

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={count ? `Notifications, ${count} waiting on you` : inbox.news ? `Notifications, ${inbox.news} new` : 'Notifications'} title="Notifications"
        className={`relative w-10 h-10 shrink-0 grid place-items-center rounded-xl hover:bg-sky-50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${ringing ? 'nt-ring' : ''} ${count && !open ? 'nt-waiting' : ''} ${className}`}>
        <BellGlyph />
        <Count needs={count} unread={inbox.news} className={count ? 'top-0.5 right-0' : 'top-1.5 right-1.5'} label={count ? `${count} waiting on you` : `${inbox.news} new`} />
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
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  {(count || inbox.news) > 0 && <span key={count || inbox.news} className={`nt-flip tabular-nums ${count ? 'text-rose-600' : 'text-[#3D52A0]'}`}>{count || inbox.news}</span>}
                  {headline}
                </p>
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
            {offer && view === 'inbox' && (
              <div className="hud-row-in mx-3 mt-3 rounded-2xl border border-[#3D52A0]/20 bg-[#3D52A0]/5 px-3 py-2.5 flex items-center gap-3">
                <Monitor className="w-4 h-4 text-[#3D52A0] shrink-0" />
                <p className="flex-1 text-xs text-slate-600">{inbox.audience === 'client'
                  ? 'Get an alert on this device when the studio shares something for you and the portal is in another tab.'
                  : 'Get an alert on your computer when someone is waiting on you and StudioDesk is in another tab.'}</p>
                <button type="button" onClick={async () => { await askDesktop(); markOffered(); setOffer(false); }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">Turn on</button>
                <button type="button" aria-label="Not now" title="Not now" onClick={() => { markOffered(); setOffer(false); }} className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {alerts.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between gap-3">
                  <span className="truncate">On this project · {project!.name}</span><span>{alerts.length}</span>
                </p>
                <ul className="divide-y divide-slate-100">
                  {alerts.map((a, i) => (
                    <li key={a.id} className="hud-row-in flex gap-3 px-4 py-3" style={{ animationDelay: `${i * 35}ms` }}>
                      <div className="flex-1 min-w-0">
                        <span className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ALERT_TONE[a.kind] || ALERT_TONE.portal}`}>{a.label}</span>
                        <p className="text-sm font-semibold text-slate-800 mt-1">{a.title}</p>
                        <p className="text-xs text-slate-500">{a.detail}</p>
                        {a.when && <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{a.when}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <button type="button" onClick={() => { setOpen(false); project!.onGo(a.goTo); }}
                            className="pp-press px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">{a.cta}</button>
                          <button type="button" onClick={() => project!.onDismiss(a.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50">Dismiss</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="px-4 pb-2 text-[11px] text-slate-500">Nothing here is sent to your client. Review it, then release from the Client Portal tab.</p>
              </div>
            )}
            {!list.length && alerts.length ? null : !list.length ? (
              <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
                <DoneTick size={44} />
                <p className="font-bold text-slate-800 mt-1">{view === 'inbox' ? 'All caught up' : 'Nothing done yet'}</p>
                <p className="text-xs text-slate-500">{view === 'inbox' ? 'New notes land here the moment they happen.' : 'What you mark done waits here, in case you need it back.'}</p>
              </div>
            ) : (
              <>
              {asking.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2"><span className="nt-wait-dot" aria-hidden />Waiting on you</span><span>{asking.length}</span>
                  </p>
                  <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }} className="divide-y divide-slate-100">
                    <AnimatePresence initial={false}>
                      {asking.map((n) => <Row key={n.id} n={n} view={view} onOpen={() => open_(n)} />)}
                    </AnimatePresence>
                  </motion.ul>
                </div>
              )}
              {groups(rest).map((g) => (
                <div key={g.name}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between"><span>{g.name}</span><span>{g.items.length}</span></p>
                  <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.035 } } }} className="divide-y divide-slate-100">
                    <AnimatePresence initial={false}>
                      {g.items.map((n) => <Row key={n.id} n={n} view={view} onOpen={() => open_(n)} />)}
                    </AnimatePresence>
                  </motion.ul>
                </div>
              ))}
              </>
            )}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">{inbox.audience === 'client' ? 'A red number is something waiting on you. A dot is something new.' : 'A red number is someone waiting on you, until it is done. A dot is something new.'}</span>
            <button type="button" onClick={() => { setOpen(false); setSettings(true); }}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-[#3D52A0] hover:underline"><SlidersHorizontal className="w-3.5 h-3.5" />{inbox.audience === 'client' ? 'Alerts on this device' : 'What reaches you'}</button>
          </div>
        </motion.div>,
        document.body,
      )}
      {settings && <NotifySettings onClose={() => setSettings(false)} />}
    </>
  );
}
