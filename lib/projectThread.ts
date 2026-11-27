/*
  ONE PROJECT'S STORY, for the Conversations workspace (lib/projectConversations).

  Built from what the Clients screen's thread is built from (lib/clientThread
  buildThread, run for this one project) and the project's own history of
  changes (context.history, lib/projectHistory). Each item is given the
  conversations it belongs to and the screen its Open button leads to.

  Payments and signatures are already in the client thread, so the history's
  money and document lines are left out rather than said twice.
*/
import type { HistoryEvent } from '../types';
import { dayGroupOf, type DayGroup, type ThreadEntry, type ThreadSource } from './clientThread';
import type { ConversationId } from './projectConversations';

export interface StoryItem extends ThreadEntry {
  /** The conversations it shows in; Whole project shows everything. */
  convs: ConversationId[];
  /** The screen its Open button leads to, or none. */
  route: string | null;
}

const BY_SOURCE: Record<ThreadSource, { conv: ConversationId; route: string | null }> = {
  sent: { conv: 'chat', route: 'comms-tracker' },
  portal: { conv: 'chat', route: 'client-portal' },
  payments: { conv: 'money', route: 'payment-calc' },
  design: { conv: 'design', route: 'drawing-tracker' },
  site: { conv: 'site', route: 'site-meetings' },
  proposals: { conv: 'docs', route: 'docs' },
  team: { conv: 'plan', route: null },
};

/** Where one thread entry belongs. */
export function placeEntry(e: ThreadEntry): { convs: ConversationId[]; route: string | null } {
  if (e.kind === 'sticker') {
    if (e.tone === 'bad') return { convs: ['money'], route: 'payment-calc' };
    if (e.tone === 'warn') return { convs: ['chat'], route: 'comms-tracker' };
    return { convs: ['docs'], route: 'docs' };
  }
  if (e.kind === 'said') return { convs: ['chat'], route: 'comms-tracker' };
  if (e.source === 'site') return placeMeeting(e);
  const s = BY_SOURCE[e.source || 'team'];
  return { convs: [s.conv], route: s.route };
}

/*
  Visits, meetings and minutes are filed by what they were about (owner,
  27 Nov 2026: design reviews showed under Site): a site visit goes to
  Execution, a measurement to Brief & Survey, a meeting or minutes about the
  design (drawings, layouts, materials, a review) to Drawings & Design, one
  about the site works to Execution, and any other client meeting stays in
  the Overview story. Each still opens Meetings & Reports, where it is kept.
*/
const DESIGN_TOPIC = /design|drawing|layout|render|elevation|\b3d\b|mood ?board|material|selection|colou?r|finish|space plan|concept/i;
const SITE_TOPIC = /\bsite\b|snag|handover|execution|civil|carpentry|electrical|plumbing|paint|install|labour|work ?order|progress/i;
export function placeMeeting(e: ThreadEntry): { convs: ConversationId[]; route: string | null } {
  const what = `${e.text} ${e.detail || ''}`;
  const route = 'site-meetings';
  if (/^site visit/i.test(e.text)) return { convs: ['site'], route };
  if (/^measurement/i.test(e.text)) return { convs: ['brief'], route };
  if (DESIGN_TOPIC.test(what)) return { convs: ['design'], route };
  if (SITE_TOPIC.test(what)) return { convs: ['site'], route };
  return { convs: [], route };
}

const HISTORY_PLACE: Partial<Record<HistoryEvent['category'], { conv: ConversationId; route: string; source: ThreadSource }>> = {
  stage: { conv: 'plan', route: 'project-journey', source: 'team' },
  design: { conv: 'design', route: 'design-gate', source: 'design' },
  scope: { conv: 'boq', route: 'boq-editor', source: 'proposals' },
};

/** A note's subject key, so it stays in the conversation it was written in ("conv:money"). */
export const noteKey = (conv: ConversationId) => `conv:${conv}`;

/**
 * The conversation each note was written in, by its thread entry id
 * (`f-{follow-up id}`), from the follow-up log's subjects.
 */
export function noteHomes(followUps: Array<{ id: string; subject?: { key?: string } | null }>): Record<string, ConversationId> {
  const out: Record<string, ConversationId> = {};
  for (const f of followUps || []) {
    const k = f?.subject?.key || '';
    if (k.startsWith('conv:')) out[`f-${f.id}`] = k.slice(5) as ConversationId;
  }
  return out;
}

/** The whole story, oldest first. A note stays in the conversation it was written in (`homes`). */
export function buildStory(entries: ThreadEntry[], history: HistoryEvent[] | undefined, projectId: string, homes: Record<string, ConversationId> = {}): StoryItem[] {
  const out: StoryItem[] = entries.map((e) => {
    const home = homes[e.id];
    if (home) return { ...e, convs: home === 'whole' ? [] : [home], route: null };
    return { ...e, ...placeEntry(e) };
  });
  for (const h of history || []) {
    const place = HISTORY_PLACE[h.category];
    if (!place || !Number.isFinite(h.at)) continue;
    out.push({
      id: `hist-${h.id}`, at: h.at, kind: 'event', side: 'studio', text: h.summary, detail: h.detail || null,
      meta: h.actor ? `by ${h.actor}` : null, source: place.source, projectId, convs: [place.conv], route: place.route,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The items one conversation shows. */
export const storyFor = (items: StoryItem[], conv: ConversationId): StoryItem[] =>
  conv === 'whole' ? items : items.filter((i) => i.convs.includes(conv));

/** The latest item of a conversation, for its line in the list. */
export const latestOf = (items: StoryItem[], conv: ConversationId): StoryItem | null => {
  const mine = storyFor(items, conv);
  return mine.length ? mine[mine.length - 1] : null;
};

/** Grouped by day, as Clients groups its thread: Earlier, This week, Yesterday, Today. */
export function groupStory(items: StoryItem[], now: number): Array<{ group: DayGroup; items: StoryItem[] }> {
  const out: Array<{ group: DayGroup; items: StoryItem[] }> = [];
  for (const i of items) {
    const g = dayGroupOf(i.at, now);
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push(i);
    else out.push({ group: g, items: [i] });
  }
  return out;
}

/** How long ago, for the list: "10:12", "Yesterday", "3 Nov". */
export function whenShort(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const y = new Date(now - 86400000);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
