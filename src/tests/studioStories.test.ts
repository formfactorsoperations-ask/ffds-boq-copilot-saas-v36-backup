import { describe, it, expect } from 'vitest';
import type { Person } from '../../lib/peopleDesk';
import { guideView, seenAfter, SEEN_KEEP, type GuideStore, type OfficeDetails } from '../../lib/peopleGuide';
import { autoOpenOf, KUDOS_PER_PERSON, storiesOf, storySeen, storyWhen, storyWords, stripWords, unseenCount } from '../../lib/studioStories';

/* Studio stories on Home (the owner, 26 Nov 2026; DESIGN.md → "Studio stories"). */

const person = (id: string, over: Partial<Person> = {}): Person => ({ id, name: id.toUpperCase(), title: '', teamId: 'design', managerId: '', accessRole: 'employee', active: true, email: `${id}@studio.in`, ...over });
const office = (over: Partial<OfficeDetails> = {}): OfficeDetails => ({ desk: '', computer: '', mobile: '', ext: '', birthday: '', joinedOn: '', showBirthday: true, remoteId: '', ...over });
const NOW = new Date('2026-11-26T10:00:00.000Z');
const TODAY = '2026-11-26';
const people = [person('me', { name: 'Anish K' }), person('pn', { name: 'Priya Nair' }), person('mi', { name: 'Meera Iyer' }), person('rv', { name: 'Rahul Verma' }), person('ar', { name: 'Arjun Rao' })];
const k = (id: string, from: string, to: string, at: string) => ({ id, from, to, at, tag: 'Above and beyond' as const, text: 'Thank you', hearts: [] as string[] });
const view = (over: Partial<GuideStore> = {}, me = 'me') =>
  guideView({ people, offices: {}, essentials: null, cards: {}, kudos: [], emergency: null, ...over }, people.find((p) => p.id === me)!, TODAY);
const nameOf = (id: string) => people.find((p) => p.id === id)?.name || 'Someone';

describe('what becomes a story', () => {
  it('is every thank-you on the wall, and a birthday or anniversary today, not tomorrow', () => {
    const v = view({
      offices: { pn: office({ birthday: '11-26' }), rv: office({ joinedOn: '2023-11-26' }), ar: office({ birthday: '11-27' }) },
      kudos: [k('k1', 'ar', 'mi', '2026-11-26T08:00:00.000Z'), k('old', 'ar', 'mi', '2026-11-25T09:00:00.000Z')],
    });
    const g = storiesOf(v, 'me', new Set(), NOW);
    expect(g.map((x) => [x.personId, x.stories.map((s) => s.id)])).toEqual([
      ['pn', ['birthday_pn_2026-11-26']], ['rv', ['anniversary_rv_2026-11-26']], ['mi', ['old', 'k1']],
    ]);
  });

  it('shows thank-yous older than 24 hours as already watched: they never ask to be seen or open by themselves', () => {
    const v = view({ kudos: [k('mine', 'ar', 'me', '2026-11-20T09:00:00.000Z'), k('them', 'ar', 'mi', '2026-10-30T09:00:00.000Z')] });
    const g = storiesOf(v, 'me', new Set(), NOW);
    expect(g.map((x) => [x.personId, x.seen])).toEqual([['me', true], ['mi', true]]);
    expect(unseenCount(g)).toBe(0);
    expect(autoOpenOf(g)).toBe(-1);
    expect(storyWhen(g[0].stories[0], NOW)).toBe('Kudos · 6d ago');
    expect(storyWhen(g[1].stories[0], NOW)).toBe('Kudos · 30 Oct');
  });

  it('starts a person at their new thank-you, after the older ones, and keeps only their newest few', () => {
    const many = Array.from({ length: KUDOS_PER_PERSON + 2 }, (_, i) => k(`o${i}`, 'ar', 'mi', `2026-11-${String(10 + i).padStart(2, '0')}T09:00:00.000Z`));
    const [g] = storiesOf(view({ kudos: [...many, k('new', 'pn', 'mi', '2026-11-26T09:00:00.000Z')] }), 'me', new Set(), NOW);
    expect(g.stories).toHaveLength(KUDOS_PER_PERSON);
    expect(g.stories[g.stories.length - 1].id).toBe('new');
    expect(g.start).toBe(KUDOS_PER_PERSON - 1);
    expect(g.seen).toBe(false);
  });

  it('groups by the person it is about: their day first, then the thank-yous as they came', () => {
    const v = view({
      offices: { mi: office({ birthday: '11-26' }) },
      kudos: [k('late', 'ar', 'mi', '2026-11-26T09:00:00.000Z'), k('early', 'pn', 'mi', '2026-11-26T07:00:00.000Z')],
    });
    const [g] = storiesOf(v, 'me', new Set(), NOW);
    expect(g.stories.map((s) => s.id)).toEqual(['birthday_mi_2026-11-26', 'early', 'late']);
    expect(stripWords(g, nameOf)).toEqual({ name: 'Meera Iyer', sub: 'Birthday today' });
  });
});

describe('the order of the row', () => {
  const v = view({
    offices: { pn: office({ birthday: '11-26' }) },
    kudos: [
      k('a', 'ar', 'mi', '2026-11-26T06:00:00.000Z'),
      k('b', 'pn', 'rv', '2026-11-26T09:00:00.000Z'),
      k('mine', 'mi', 'me', '2026-11-26T05:00:00.000Z'),
    ],
  });

  it('puts yours first, then what you have not watched (a day before thank-yous, the newest first), then what you have', () => {
    expect(storiesOf(v, 'me', new Set(), NOW).map((g) => g.personId)).toEqual(['me', 'pn', 'rv', 'mi']);
    expect(storiesOf(v, 'me', new Set(['birthday_pn_2026-11-26']), NOW).map((g) => g.personId)).toEqual(['me', 'rv', 'mi', 'pn']);
  });

  it('counts a story as watched only once it has been on screen, or when you wrote it', () => {
    const g = storiesOf(v, 'me', new Set(['a']), NOW);
    expect(unseenCount(g)).toBe(3);
    expect(g.find((x) => x.personId === 'mi')!.seen).toBe(true);
    const own = storiesOf(view({ kudos: [k('x', 'me', 'mi', '2026-11-26T09:00:00.000Z')] }), 'me', new Set(), NOW);
    expect(own[0].seen).toBe(true);
    expect(storySeen(own[0].stories[0], '', new Set())).toBe(false);
  });

  it('starts a group at the first story not yet watched', () => {
    const two = view({ kudos: [k('one', 'ar', 'mi', '2026-11-26T06:00:00.000Z'), k('two', 'pn', 'mi', '2026-11-26T07:00:00.000Z')] });
    expect(storiesOf(two, 'me', new Set(['one']), NOW)[0].start).toBe(1);
    expect(stripWords(storiesOf(two, 'me', new Set(), NOW)[0], nameOf).sub).toBe('2 thank-yous');
  });
});

describe('opening by itself', () => {
  it('opens one about you that you have not watched, and nothing else', () => {
    const v = view({ kudos: [k('mine', 'mi', 'me', '2026-11-26T05:00:00.000Z'), k('b', 'pn', 'rv', '2026-11-26T09:00:00.000Z')] });
    expect(autoOpenOf(storiesOf(v, 'me', new Set(), NOW))).toBe(0);
    expect(autoOpenOf(storiesOf(v, 'me', new Set(['mine']), NOW))).toBe(-1);
    expect(autoOpenOf(storiesOf(v, 'pn', new Set(), NOW))).toBe(-1);
  });

  it('opens your own birthday, which only you see as yours', () => {
    const v = view({ offices: { me: office({ birthday: '11-26' }) } });
    const g = storiesOf(v, 'me', new Set(), NOW);
    expect(autoOpenOf(g)).toBe(0);
    expect(stripWords(g[0], nameOf).name).toBe('Your day');
  });
});

describe('what a story says', () => {
  it('names who thanked whom, and you when it is you', () => {
    const v = view({ kudos: [k('a', 'ar', 'mi', '2026-11-26T09:30:00.000Z'), k('b', 'ar', 'me', '2026-11-26T07:00:00.000Z')] });
    const g = storiesOf(v, 'me', new Set(), NOW);
    expect(storyWords(g[0].stories[0], nameOf, 'me').title).toBe('Arjun Rao thanked you');
    expect(storyWords(g[1].stories[0], nameOf, 'me').title).toBe('Arjun thanked Meera');
    expect(storyWhen(g[1].stories[0], NOW)).toBe('Kudos · 30 min ago');
    expect(storyWhen(g[0].stories[0], NOW)).toBe('Kudos · 3h ago');
  });

  it('asks you to sign a card, says when you have, and tells the person how many have', () => {
    const offices = { pn: office({ birthday: '11-26' }), me: office({ joinedOn: '2023-11-26' }) };
    const cards = { 'birthday_pn_2026-11-26': [{ by: 'mi', name: 'Meera Iyer', text: 'Yay', at: 't' }] };
    const words = (me: string, signed = cards) => storiesOf(view({ offices, cards: signed }, me), me, new Set(), NOW)
      .map((g) => storyWords(g.stories[0], nameOf, me));
    expect(words('me')).toEqual([
      { title: '3 years with the studio. Thank you, Anish!', line: 'Your card is open. The studio is signing it today' },
      { title: "It's Priya's birthday", line: '1 person has signed. Add your wish' },
    ]);
    expect(words('mi')[1].line).toBe('You have signed the card');
    expect(words('pn')[0]).toEqual({ title: 'Happy birthday, Priya!', line: '1 person has signed your card' });
  });
});

describe('what is kept of the stories watched', () => {
  it('keeps each once, the newest last, and only so many', () => {
    expect(seenAfter(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: SEEN_KEEP }, (_, i) => `s${i}`);
    expect(seenAfter(many, ['new']).slice(-2)).toEqual([`s${SEEN_KEEP - 1}`, 'new']);
    expect(seenAfter(many, ['new'])).toHaveLength(SEEN_KEEP);
  });

  it('takes only story IDs, a few at a time', () => {
    expect(() => seenAfter([], [])).toThrow();
    expect(() => seenAfter([], ['../x'])).toThrow();
    expect(() => seenAfter([], Array.from({ length: 51 }, (_, i) => `s${i}`))).toThrow();
    expect(seenAfter(undefined, ['birthday_pn_2026-11-26', 'me_abc-12'])).toEqual(['birthday_pn_2026-11-26', 'me_abc-12']);
  });

  it('is part of the view, for the person viewing only', () => {
    expect(view({ seen: ['a'] }).seen).toEqual(['a']);
    expect(view().seen).toEqual([]);
  });
});
