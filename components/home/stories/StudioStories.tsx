import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from '@/lib/lucide-shim';
import type { HomeFeeds } from '../useHomeFeeds';
import { autoOpenOf, storiesOf, unseenCount, type StoryGroup } from '../../../lib/studioStories';
import { openPeopleSection } from '../../../lib/peopleSection';
import { usePeople } from '../../../services/peopleService';
import { flushSeenStories, markStoriesSeen, seenStories, useGuide } from '../../../services/peopleGuideService';
import { useNoteArrivals } from '../../notify/NotifyContext';
import { StoryTile } from './StoryTile';
import StoryViewer from './StoryViewer';
import './storyStyles';

/*
  STUDIO STORIES (lib/studioStories.ts; the owner, 26 Nov 2026): a row of
  stories right under the greeting on Home, like Facebook's. A thank-you
  stays for 24 hours, a birthday or work anniversary for its day; each is a
  collectible card. A story not yet watched has a ring that turns; once
  watched it goes grey and moves to the end. One about you opens full screen
  by itself the first time you come to Home. Left out when there are none.
*/
export default function StudioStories({ feeds, onNavigate }: { feeds: HomeFeeds; onNavigate: (tab: string) => void }) {
  const { snapshot, error } = usePeople(feeds.people);
  const onPeople = feeds.people && !(error && !snapshot);
  const guide = useGuide(!!onPeople);
  useNoteArrivals((n) => n.kind.startsWith('guide.'), () => guide.refresh());
  const meId = snapshot?.me?.id || '';
  /* Kept for the person, or the browser's sign-in while People is still loading. */
  const who = meId || 'me';

  /* What has been on screen in this visit, so the row greys a story at once. */
  const [watched, setWatched] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 5 * 60000); return () => window.clearInterval(id); }, []);
  const view = guide.view;
  const groups = useMemo(() => {
    if (!view || !onPeople) return [] as StoryGroup[];
    const seen = seenStories(who, view.seen);
    watched.forEach((id) => seen.add(id));
    return storiesOf(view, meId, seen, now);
  }, [view, onPeople, who, meId, watched, now]);

  const [open, setOpen] = useState<{ groups: StoryGroup[]; start: number } | null>(null);
  const onSeen = useCallback((id: string) => {
    markStoriesSeen(who, [id]);
    setWatched((w) => (w.has(id) ? w : new Set(w).add(id)));
  }, [who]);
  const close = useCallback(() => { setOpen(null); flushSeenStories(); }, []);
  useEffect(() => () => flushSeenStories(), []);

  /* One about you opens by itself, once, as soon as People knows who you are. */
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !meId || !groups.length) return;
    autoOpened.current = true;
    const k = autoOpenOf(groups);
    if (k >= 0) setOpen({ groups, start: k });
  }, [groups, meId]);

  const openPeople = (section: 'kudos' | 'celebrations') => { openPeopleSection(section); onNavigate('people'); };

  if (!groups.length || !view) return null;
  const fresh = unseenCount(groups);
  const nameOf = (id: string) => view.entries.find((e) => e.id === id)?.name || 'Someone';

  return (
    <div className="hud-panel-in mt-6 w-full max-w-full">
      <div className="flex items-center justify-center gap-2 mb-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Studio stories</p>
        {fresh > 0 && <span className="px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[10px] font-bold uppercase tracking-wider">{fresh} new</span>}
        <button type="button" onClick={() => setOpen({ groups, start: Math.max(0, groups.findIndex((g) => !g.seen)) })}
          className="text-xs font-bold text-[#3D52A0] hover:underline">
          {fresh > 0 ? 'Watch all' : 'Watch again'}
        </button>
      </div>
      <div className="flex justify-center">
        <div role="list" aria-label="Studio stories" className="ss-strip w-max max-w-full flex gap-2.5 overflow-x-auto snap-x snap-mandatory px-1 pt-1 pb-2">
          <button type="button" role="listitem" onClick={() => openPeople('kudos')}
            className="ss-tile relative shrink-0 snap-start overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white w-[112px] h-[188px] sm:w-[124px] sm:h-[208px]">
            <span className="absolute inset-x-0 top-0 h-[62%] bg-[#3D52A0]/[0.06] grid place-items-center text-xs font-semibold text-slate-500">Thank someone</span>
            <span className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#3D52A0] text-white grid place-items-center border-4 border-white">
              <Plus className="w-4 h-4" />
            </span>
            <span className="absolute inset-x-0 bottom-4 text-center text-xs font-bold text-slate-800">Give kudos</span>
          </button>
          {groups.map((g, k) => <StoryTile key={g.personId} group={g} nameOf={nameOf} onOpen={() => setOpen({ groups, start: k })} />)}
        </div>
      </div>
      {open && (
        <StoryViewer groups={open.groups} start={open.start} view={view} meId={meId}
          onSeen={onSeen} onClose={close} onOpenPeople={openPeople} />
      )}
    </div>
  );
}
