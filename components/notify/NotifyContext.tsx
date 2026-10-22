import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { foldGroups, isOpen, tabCounts, type Stored } from '../../lib/notify';
import { listenInbox, markDone, markRead, snooze as snoozeNotes, undoDone } from '../../services/inboxService';

/*
  THE INBOX, ONCE FOR THE WHOLE APP.

  One live listener (services/inboxService.ts) feeds every place a note
  shows: the badges on the tabs, the bell, the glass "needs you" bar, and the
  screens that light up a change in place. Counts are worked out from the
  notes as they stand, so a badge changes the moment a note lands and never
  waits for an animation.

  A note that arrives while the app is open is announced on the window as
  `studiodesk:note`, so a screen that shows the thing itself (People's
  arrivals, the Ops Desk) can reload it at once rather than on its own clock.
*/

export const NOTE_EVENT = 'studiodesk:note';
export type Folded = ReturnType<typeof foldGroups>[number];

interface InboxState {
  ready: boolean;
  /** Open notes, newest first, with bursts folded ("4 people checked in"). */
  open: Folded[];
  /** Notes marked done, newest first. */
  done: Stored[];
  /** Open notes not yet read: the bell's count and the tab title's. */
  unread: number;
  /** Per top-bar tab: the number waiting on you, and unread updates. */
  byTab: Record<string, { needs: number; unread: number }>;
  /** Open notes on one project, by the project tab they open: the number waiting on you, and unread updates. */
  forProject: (projectId: string | null | undefined) => Record<string, { needs: number; unread: number }>;
  /** The "needs you" notes that arrived while the app was open and are still waiting, newest first. */
  arrivals: Stored[];
  /** The newest note to arrive while the app was open, for the live stamp. */
  latest: Stored | null;
  openNote: (n: Stored) => void;
  done_: (ids: string[]) => void;
  undo: (ids: string[]) => void;
  snooze: (ids: string[], until: number) => void;
  read: (ids: string[]) => void;
  readAll: () => void;
  /** Close the bar on a note without doing it; it stays in the bell. */
  dismiss: (id: string) => void;
}

const Ctx = createContext<InboxState | null>(null);

/** The inbox, or nothing when there is no signed-in studio member (the client portal, the login screen). */
export const useInbox = () => useContext(Ctx);

export const NotifyProvider: React.FC<{ email: string | null | undefined; onOpen: (n: Stored) => void; children: React.ReactNode }> =
  ({ email, onOpen, children }) => {
    const [notes, setNotes] = useState<Stored[]>([]);
    const [ready, setReady] = useState(false);
    const [arrivedIds, setArrivedIds] = useState<string[]>([]);
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [latest, setLatest] = useState<Stored | null>(null);
    const known = useRef<Set<string> | null>(null);
    /* An arrival is a note written after this page opened. Firestore can answer first from its cache and
       then from the server, so "not in the first answer" alone would replay old notes as new. Two minutes
       of grace covers a server clock that runs a little ahead of this one. */
    const openedAt = useRef(Date.now() - 120000);
    const [now, setNow] = useState(() => Date.now());
    const openRef = useRef(onOpen);
    openRef.current = onOpen;

    useEffect(() => {
      known.current = null;
      setNotes([]); setReady(false); setArrivedIds([]); setLatest(null);
      if (!email) return;
      return listenInbox(email, (list) => {
        const seen = known.current;
        known.current = new Set(list.map((n) => n.id));
        setNotes(list);
        setReady(true);
        /* The first answer is what was already there; only later ones are arrivals. */
        if (!seen) return;
        const fresh = list.filter((n) => !seen.has(n.id) && n.at >= openedAt.current).sort((a, b) => a.at - b.at);
        if (!fresh.length) return;
        fresh.forEach((n) => window.dispatchEvent(new CustomEvent(NOTE_EVENT, { detail: n })));
        setLatest(fresh[fresh.length - 1]);
        const needs = fresh.filter((n) => n.level === 'needs').map((n) => n.id);
        if (needs.length) setArrivedIds((ids) => [...needs.reverse(), ...ids].slice(0, 20));
      }, () => setReady(true));
    }, [email]);

    /* A snooze ends by itself: look again every minute. */
    useEffect(() => {
      const t = window.setInterval(() => setNow(Date.now()), 60000);
      return () => window.clearInterval(t);
    }, []);

    const openNotes = useMemo(() => notes.filter((n) => isOpen(n, now)), [notes, now]);
    const unread = useMemo(() => openNotes.filter((n) => !n.readAt).length, [openNotes]);

    /* "(3) StudioDesk" in the browser tab, so a count shows from another tab. */
    const baseTitle = useRef<string>('');
    useEffect(() => {
      if (!baseTitle.current) baseTitle.current = document.title.replace(/^\(\d+\)\s*/, '');
      document.title = unread ? `(${unread}) ${baseTitle.current}` : baseTitle.current;
    }, [unread]);
    useEffect(() => () => { if (baseTitle.current) document.title = baseTitle.current; }, []);

    const done_ = useCallback((ids: string[]) => {
      setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, doneAt: Date.now(), readAt: n.readAt || Date.now() } : n)));
      markDone(email, ids).catch(() => {});
    }, [email]);
    const undo = useCallback((ids: string[]) => {
      setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, doneAt: null, snoozedUntil: null } : n)));
      undoDone(email, ids).catch(() => {});
    }, [email]);
    const snooze = useCallback((ids: string[], until: number) => {
      setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, snoozedUntil: until, readAt: n.readAt || Date.now() } : n)));
      snoozeNotes(email, ids, until).catch(() => {});
    }, [email]);
    const read = useCallback((ids: string[]) => {
      const fresh = ids.filter((id) => notes.find((n) => n.id === id && !n.readAt));
      if (!fresh.length) return;
      setNotes((ns) => ns.map((n) => (fresh.includes(n.id) ? { ...n, readAt: Date.now() } : n)));
      markRead(email, fresh).catch(() => {});
    }, [email, notes]);
    const readAll = useCallback(() => read(openNotes.filter((n) => !n.readAt).map((n) => n.id)), [openNotes, read]);
    const openNote = useCallback((n: Stored) => { read([n.id]); setDismissed((d) => [...d, n.id]); openRef.current(n); }, [read]);
    const dismiss = useCallback((id: string) => setDismissed((d) => [...d, id]), []);

    const value = useMemo<InboxState>(() => {
      const byProject = new Map<string, Record<string, { needs: number; unread: number }>>();
      for (const n of openNotes) {
        if (!n.projectId || (n.readAt && n.level !== 'needs')) continue;
        const m = byProject.get(n.projectId) || {};
        const c = (m[n.route] ||= { needs: 0, unread: 0 });
        if (n.level === 'needs') c.needs++; else c.unread++;
        byProject.set(n.projectId, m);
      }
      const arrivals = arrivedIds
        .map((id) => notes.find((n) => n.id === id))
        .filter((n): n is Stored => !!n && isOpen(n, now) && !dismissed.includes(n.id));
      return {
        ready,
        open: foldGroups(notes, now),
        done: notes.filter((n) => n.doneAt).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)),
        unread,
        byTab: tabCounts(notes, now),
        forProject: (id) => (id && byProject.get(id)) || {},
        arrivals,
        latest,
        openNote, done_, undo, snooze, read, readAll, dismiss,
      };
    }, [notes, openNotes, now, unread, ready, arrivedIds, dismissed, latest, openNote, done_, undo, snooze, read, readAll, dismiss]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  };

/** Run `fn` whenever a note arrives that `match` accepts: a screen reloads what it shows. */
export function useNoteArrivals(match: (n: Stored) => boolean, fn: (n: Stored) => void): void {
  const m = useRef(match), f = useRef(fn);
  m.current = match; f.current = fn;
  useEffect(() => {
    const on = (e: Event) => { const n = (e as CustomEvent<Stored>).detail; if (n && m.current(n)) f.current(n); };
    window.addEventListener(NOTE_EVENT, on);
    return () => window.removeEventListener(NOTE_EVENT, on);
  }, []);
}
