import React from 'react';
import { stripWords, type StoryGroup } from '../../../lib/studioStories';
import { initials } from '../../people/PeopleBits';
import { MiniCard } from './StoryCard';
import { TINT } from './storyStyles';

/*
  One story in the row on Home (DESIGN.md → "Studio stories"): a tall tile in
  its kind's paper tint, the collectible card inside it, the person's face in a
  ring that turns until the story is watched, and their name at its foot.
*/
export const StoryTile: React.FC<{
  group: StoryGroup;
  nameOf: (id: string) => string;
  onOpen?: () => void;
  /** The larger, still tile beside the viewer. */
  side?: boolean;
}> = ({ group, nameOf, onOpen, side = false }) => {
  const lead = group.stories[group.start] || group.stories[0];
  const t = TINT[lead.kind];
  const w = stripWords(group, nameOf);
  const size = side ? 'w-[150px] h-[266px]' : 'w-[112px] h-[188px] sm:w-[124px] sm:h-[208px]';
  const body = (
    <>
      <MiniCard story={lead} person={group.name} />
      <span className={`absolute top-2 left-2 w-9 h-9 rounded-full p-[2px] ${group.seen ? 'ss-ring-seen' : 'ss-ring'}`}>
        <span className="w-full h-full rounded-full border-2 border-white grid place-items-center text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>
          {initials(group.name)}
        </span>
      </span>
      {group.stories.length > 1 && (
        <span className="absolute top-2.5 right-2 min-w-5 h-5 px-1.5 rounded-full border bg-white grid place-items-center text-[11px] font-bold tabular-nums" style={{ color: t.fg, borderColor: t.bd }}>
          {group.stories.length}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-5 text-left bg-gradient-to-b from-transparent via-white/90 to-white">
        <span className="block text-xs font-bold text-slate-800 leading-tight truncate">{w.name}</span>
        <span className="block text-[11px] font-semibold text-slate-500 truncate">{w.sub}</span>
      </span>
    </>
  );
  const shell = `relative block shrink-0 snap-start overflow-hidden rounded-2xl border text-left shadow-[0_8px_18px_-14px_rgba(30,42,90,.35)] ${size}`;
  const style = { borderColor: t.bd, background: `linear-gradient(180deg, ${t.bg} 0%, #FFFFFF 88%)` };
  if (side) return <span aria-hidden className={shell} style={style}>{body}</span>;
  return (
    <button type="button" onClick={onOpen} role="listitem" className={`ss-tile ${shell}`} style={style}
      aria-label={`${w.name}: ${w.sub}${group.seen ? ', watched' : ''}`}>
      {body}
    </button>
  );
};
