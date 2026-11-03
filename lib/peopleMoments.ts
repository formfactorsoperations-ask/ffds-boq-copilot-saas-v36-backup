/*
  PEOPLE: MOMENTS WORTH A LITTLE CONFETTI (the owner, 3 Nov 2026).

  "Whenever kudos is given, add an animation with confetti on the kudos page
  as well as on the homepage, for people to see; similarly for birthdays."

  A moment is a thank-you pinned up in the last week, or a birthday or work
  anniversary today (lib/peopleGuide.ts). Each plays once for each person in
  each place it shows (Home, the kudos wall, the card): the browser remembers
  which it has played (services/peopleGuideService.ts). Your own thank-yous
  are never played back to you; one to you, or your own birthday, comes first.

  Pure, so the tests run the same code.
*/
import type { GuideView } from './peopleGuide';

export type MomentKind = 'kudos' | 'birthday' | 'anniversary';
export interface Moment {
  /** Stable while it is the same moment: what is remembered once it has played. */
  id: string;
  kind: MomentKind;
  title: string;
  line: string;
  /** The People section that holds it. */
  section: 'kudos' | 'celebrations';
  /** The person it is about (who was thanked, or whose day it is). */
  personId: string;
  /** About the person viewing: thanked them, or their own day. */
  mine: boolean;
  /** Everything it stands for (several thank-yous fold into one moment). */
  ids: string[];
  /** A card the person viewing has already signed. */
  signed?: boolean;
}

const WEEK = 7 * 86400000;
const firstOf = (name: string) => name.split(/\s+/)[0] || name;

/** Moments not yet played here, the ones about you first. At most three thank-yous show one by one; more fold into one. */
export function momentsOf(v: GuideView, meId: string, played: Set<string>, now = new Date()): Moment[] {
  const name = (id: string) => v.entries.find((e) => e.id === id)?.name || 'Someone';
  const days: Moment[] = v.cards
    .filter((c) => c.days === 0 && !played.has(c.id))
    .map((c) => {
      const n = name(c.personId);
      const signed = c.wishes.length;
      const years = `${c.years} year${c.years === 1 ? '' : 's'}`;
      return {
        id: c.id, kind: c.kind, section: 'celebrations', personId: c.personId, mine: c.mine, ids: [c.id], signed: c.signed,
        title: c.mine
          ? (c.kind === 'birthday' ? `Happy birthday, ${firstOf(n)}!` : `${years} with the studio. Thank you, ${firstOf(n)}!`)
          : (c.kind === 'birthday' ? `It's ${n}'s birthday today` : `${n}: ${years} with the studio today`),
        line: c.mine
          ? (signed ? `${signed} ${signed === 1 ? 'person has' : 'people have'} signed your card` : 'Your card is open. The studio is signing it today')
          : (c.signed ? 'You have signed the card' : signed ? `${signed} signed so far. Add your wish` : 'Be the first to sign the card'),
      } as Moment;
    });
  const since = new Date(now.getTime() - WEEK).toISOString();
  const fresh = v.kudos.filter((k) => k.from !== meId && k.at >= since && !played.has(k.id));
  const toMe: Moment[] = fresh.filter((k) => k.to === meId).map((k) => ({
    id: k.id, kind: 'kudos', section: 'kudos', personId: k.to, mine: true, ids: [k.id],
    title: `${name(k.from)} thanked you`, line: `${k.tag}: ${k.text}`,
  }));
  const others = fresh.filter((k) => k.to !== meId);
  const kudos: Moment[] = others.length > 3
    ? [{
      id: others.map((k) => k.id).sort().join('+'), kind: 'kudos', section: 'kudos', personId: others[0].to, mine: false, ids: others.map((k) => k.id),
      title: `${others.length} new thank-yous on the kudos wall`,
      line: others.slice(0, 3).map((k) => `${firstOf(name(k.from))} thanked ${firstOf(name(k.to))}`).join(' · '),
    }]
    : others.map((k) => ({
      id: k.id, kind: 'kudos', section: 'kudos', personId: k.to, mine: false, ids: [k.id],
      title: `${name(k.from)} thanked ${name(k.to)}`, line: `${k.tag}: ${k.text}`,
    }));
  return [...days.filter((m) => m.mine), ...toMe, ...days.filter((m) => !m.mine), ...kudos];
}
