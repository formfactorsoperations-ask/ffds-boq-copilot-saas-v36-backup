/*
  STUDIO STORIES ON HOME (the owner, 26 Nov 2026).

  "Notifications of kudos and birthday on homepage are not visible at all."
  The glass card that dropped in at the top of Home (lib/peopleMoments.ts)
  showed for eight seconds, once, and was counted as seen before anyone had
  looked at it. The owner chose stories instead, like Facebook's: a row of
  tall cards right under the greeting, each a collectible card, that open full
  screen. DESIGN.md → "Studio stories".

  A story is a thank-you pinned up in the last 24 hours, or a birthday or work
  anniversary today. Stories are grouped by the person they are about (two
  thank-yous for Meera are one story with two bars). A story counts as seen
  only once it has been on screen, and what was seen is kept against the
  person's login (peopleGuideCommand "seen"), so it is not shown again on
  their phone. One about you opens by itself the first time you come to Home.

  Pure, so the tests run the same code.
*/
import type { CardView, GuideView, Kudos } from './peopleGuide';

export type StoryKind = 'kudos' | 'birthday' | 'anniversary';

export interface Story {
  /** The thank-you's ID, or the card's: what is remembered once it has been on screen. */
  id: string;
  kind: StoryKind;
  /** Who it is about: who was thanked, or whose day it is. */
  personId: string;
  /** When: the thank-you's time, or the day itself. */
  at: string;
  kudos?: Kudos;
  card?: CardView;
}

export interface StoryGroup {
  personId: string;
  name: string;
  /** About the person viewing. */
  mine: boolean;
  /** Their day first, then the thank-yous as they came. */
  stories: Story[];
  /** Every story in it has been on screen. */
  seen: boolean;
  /** Where to start: the first one not yet seen. */
  start: number;
}

/** How long a thank-you stays a story. A birthday or anniversary stays for its day. */
export const KUDOS_HOURS = 24;

export const firstName = (name: string) => String(name || '').split(/\s+/)[0] || name;

/** The person viewing has seen it: it has been on their screen, or they wrote it. */
export const storySeen = (s: Story, meId: string, seen: Set<string>) =>
  seen.has(s.id) || (s.kind === 'kudos' && !!meId && s.kudos?.from === meId);

/**
 * Today's stories, grouped by person: yours first, then the ones not yet
 * watched (a birthday or anniversary before thank-yous, the newest first),
 * then the ones watched, the newest first.
 */
export function storiesOf(v: GuideView, meId: string, seen: Set<string>, now = new Date()): StoryGroup[] {
  const nameOf = (id: string) => v.entries.find((e) => e.id === id)?.name || 'Someone';
  const since = now.getTime() - KUDOS_HOURS * 3600000;
  const days: Story[] = v.cards
    .filter((c) => c.days === 0)
    .map((c) => ({ id: c.id, kind: c.kind, personId: c.personId, at: c.date, card: c }));
  const thanks: Story[] = v.kudos
    .filter((k) => { const t = Date.parse(k.at); return t >= since && t <= now.getTime() + 300000; })
    .map((k) => ({ id: k.id, kind: 'kudos' as const, personId: k.to, at: k.at, kudos: k }));

  const by = new Map<string, Story[]>();
  for (const s of [...days, ...thanks]) by.set(s.personId, [...(by.get(s.personId) || []), s]);

  const groups: StoryGroup[] = [...by.entries()].map(([personId, list]) => {
    const stories = [
      ...list.filter((s) => s.kind !== 'kudos'),
      ...list.filter((s) => s.kind === 'kudos').sort((a, b) => a.at.localeCompare(b.at)),
    ];
    const first = stories.findIndex((s) => !storySeen(s, meId, seen));
    return {
      personId,
      name: nameOf(personId),
      mine: !!meId && personId === meId,
      stories,
      seen: first < 0,
      start: first < 0 ? 0 : first,
    };
  });

  const latest = (g: StoryGroup) => g.stories.reduce((m, s) => (s.kind === 'kudos' && s.at > m ? s.at : m), '');
  const hasDay = (g: StoryGroup) => g.stories.some((s) => s.kind !== 'kudos');
  const rank = (g: StoryGroup) => (g.mine ? 0 : g.seen ? 2 : 1);
  return groups.sort((a, b) =>
    rank(a) - rank(b)
    || Number(hasDay(b)) - Number(hasDay(a))
    || latest(b).localeCompare(latest(a))
    || a.name.localeCompare(b.name));
}

/** The group that opens by itself on Home: one about you not yet watched. */
export function autoOpenOf(groups: StoryGroup[]): number {
  return groups.findIndex((g) => g.mine && !g.seen);
}

export const unseenCount = (groups: StoryGroup[]) => groups.filter((g) => !g.seen).length;

const years = (n = 0) => `${n} year${n === 1 ? '' : 's'}`;

/** What the story says, in a title and a line. */
export function storyWords(s: Story, nameOf: (id: string) => string, meId: string): { title: string; line: string } {
  const who = nameOf(s.personId);
  if (s.kind === 'kudos' && s.kudos) {
    const from = nameOf(s.kudos.from);
    return {
      title: s.personId === meId ? `${from} thanked you` : `${firstName(from)} thanked ${firstName(who)}`,
      line: s.kudos.text,
    };
  }
  const c = s.card!;
  const n = c.wishes.length;
  const signedBy = `${n} ${n === 1 ? 'person has' : 'people have'} signed`;
  if (c.mine) {
    return {
      title: s.kind === 'birthday' ? `Happy birthday, ${firstName(who)}!` : `${years(c.years)} with the studio. Thank you, ${firstName(who)}!`,
      line: n ? `${signedBy} your card` : 'Your card is open. The studio is signing it today',
    };
  }
  return {
    title: s.kind === 'birthday' ? `It's ${firstName(who)}'s birthday` : `${firstName(who)}: ${years(c.years)} with the studio`,
    line: c.signed ? 'You have signed the card' : n ? `${signedBy}. Add your wish` : 'Be the first to sign the card',
  };
}

/** The label under a story in the row: whose it is, and what it is. */
export function stripWords(g: StoryGroup, nameOf: (id: string) => string): { name: string; sub: string } {
  const thanks = g.stories.filter((s) => s.kind === 'kudos');
  const day = g.stories.find((s) => s.kind !== 'kudos');
  const sub = day
    ? (day.kind === 'birthday' ? 'Birthday today' : `${years(day.card?.years)} today`)
    : thanks.length > 1 ? `${thanks.length} thank-yous` : `from ${firstName(nameOf(thanks[0].kudos!.from))}`;
  return { name: g.mine ? (day ? 'Your day' : 'Your kudos') : g.name, sub };
}

/** What a story is, in a word, and when, for the viewer's header. */
export function storyWhen(s: Story, now = new Date()): string {
  if (s.kind !== 'kudos') return s.kind === 'birthday' ? 'Birthday · today' : 'Work anniversary · today';
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(s.at)) / 60000));
  const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)}h ago`;
  return `Kudos · ${ago}`;
}
