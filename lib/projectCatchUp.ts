import type { StoryItem } from './projectThread';
import type { ConversationId } from './projectConversations';

/*
  SINCE YOU WERE HERE (smart workspace, PR 1, idea A).

  An owner or a project lead opens many projects a day. The top of Whole
  project says what moved since this person last opened this one, in at most
  three lines, so nobody has to scroll the story to find out. It reads the
  story the workspace already builds (lib/projectThread), so it says nothing
  the story does not.

  What counts most comes first: the client's own words and acts, then
  milestones (stickers: a signature, unpaid, no reply), then payments, then the
  rest; newest first within each. Nothing shows on a first visit (there is no
  "since") or when nothing moved.

  A sticker that states where things stand rather than something that
  happened (unpaid, no reply: rose and amber) is left out. It is dated today
  on every visit, and Watch-outs already says it.
*/

export interface CatchUpLine { id: string; text: string; conv: ConversationId; at: number; route: string | null }
export interface CatchUp { since: number; lines: CatchUpLine[]; /** Moved too, and in the story below. */ more: number }

/** A sticker that states where things stand (unpaid, no reply), dated today on every visit: not something that happened. */
export const isStateSticker = (i: Pick<StoryItem, 'kind' | 'tone'>) => i.kind === 'sticker' && (i.tone === 'bad' || i.tone === 'warn');

/** When something last happened on the project, from its story; null when nothing has. */
export function lastActivityOf(story: StoryItem[]): number | null {
  const at = (story || []).filter((i) => !isStateSticker(i)).reduce((m, i) => Math.max(m, i.at || 0), 0);
  return at || null;
}

const rank = (i: StoryItem): number =>
  i.side === 'client' ? 0 : i.kind === 'sticker' ? 1 : i.source === 'payments' ? 2 : 3;

/** What moved since `seenAt`; null on a first visit or when nothing moved. */
export function catchUp(story: StoryItem[], seenAt: number | null | undefined, max = 3): CatchUp | null {
  if (!seenAt) return null;
  const fresh = (story || []).filter((i) => i.at > seenAt && !isStateSticker(i));
  if (!fresh.length) return null;
  const picked = fresh.slice().sort((a, b) => rank(a) - rank(b) || b.at - a.at).slice(0, max);
  return {
    since: seenAt,
    lines: picked.map((i) => ({ id: i.id, text: i.text, conv: i.convs[0] || 'whole', at: i.at, route: i.route })),
    more: fresh.length - picked.length,
  };
}

/** When the person was last here, to follow "Since you were here": "on Tue, 25 Nov", "yesterday", "earlier today at 10:12". */
export function sinceLabel(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return `earlier today at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return 'yesterday';
  return `on ${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}
