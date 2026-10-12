/*
  Home stories (lib/homeStories.ts): which cards, rings and swatches each
  person gets, from real data only, and money only for those who see it.
*/
import { test, expect } from 'vitest';
import { buildStories, type StoryInput } from '../../lib/homeStories';
import type { DeskRow } from '../../lib/designDesk';

const NOW = new Date('2026-10-14T10:00:00+05:30');
const at = (d: string) => new Date(`${d}T10:00:00+05:30`).getTime();
const money = (n: number) => `₹${n}`;
const sheet = (id: string, state: string, by: string, extra: Partial<DeskRow> = {}, review: any = {}): DeskRow => ({
  id, projectId: 'p1', name: id, ...extra,
  review: { state, designer: { email: `${by}@s.in`, name: by[0].toUpperCase() + by.slice(1), uid: by }, attempts: 1, marksOpen: 0, updatedAt: 1, submittedAt: null, decidedAt: null, ...review } as any,
});
const ROWS: DeskRow[] = [
  sheet('Wardrobe', 'IN_REVIEW', 'kabir', { targetDate: '2026-10-12' }, { submittedAt: at('2026-10-11') }),
  sheet('Ceiling', 'IN_REVIEW', 'riya', {}, { submittedAt: at('2026-10-13') }),
  sheet('Kitchen A', 'CHANGES_REQUESTED', 'riya', { roomName: 'Kitchen', targetDate: '2026-10-15' }, { attempts: 2, marksOpen: 3, decidedAt: at('2026-10-12') }),
  sheet('Foyer', 'DRAFT', 'riya', { targetDate: '2026-10-13' }),
  sheet('Living', 'APPROVED', 'riya', {}, { decidedAt: at('2026-10-13'), attempts: 1 }),
  sheet('Dining', 'APPROVED', 'kabir', {}, { decidedAt: at('2026-10-10'), attempts: 3 }),
  sheet('Old', 'APPROVED', 'kabir', {}, { decidedAt: at('2026-09-01') }),
];
const VISITS: any[] = [
  { visit: { id: 'v1', kind: 'meeting', status: 'requested', projectName: 'Icon Dhokali' }, date: '2026-10-15', time: '11:00', daysAway: 1 },
  { visit: { id: 'v2', kind: 'site_visit', status: 'confirmed', projectName: 'Harmony 704' }, date: '2026-10-19', time: '', daysAway: 5 },
];
const base = (o: Partial<StoryInput> = {}): StoryInput => ({
  now: NOW, view: 'studio', finance: true, viewer: { reviewer: true, email: 'mayuri@s.in' },
  projects: [{ id: 'p1', context: { name: 'Harmony 704', status: 'execution' } }, { id: 'p2', context: { name: 'Sea Breeze', status: 'proposal_sent' } }],
  counts: { active: 1, pipeline: 1, booked: 1840000, open: 4440000, winRate: 42 },
  rows: ROWS, visits: VISITS, team: null, money,
  payments: [
    { key: 'pay:a', kind: 'payment', projectId: 'p1', projectName: 'Unique Vistas', label: 'Design advance', since: 0, days: 16, amount: 310000, dueKey: '2026-10-05', overdueDays: 9, reminders: 0, lastChaseAt: null },
    { key: 'pay:b', kind: 'payment', projectId: 'p1', projectName: 'Harmony 704', label: 'Execution 1', since: 0, days: 3, amount: 1110000, dueKey: '2026-10-18', overdueDays: 0, reminders: 0, lastChaseAt: null },
    { key: 'pay:c', kind: 'payment', projectId: 'p1', projectName: 'Far off', label: 'Handover', since: 0, days: 0, amount: 999, dueKey: '2026-11-30', overdueDays: 0, reminders: 0, lastChaseAt: null },
  ] as any,
  ...o,
});

test('the studio view: the most pressing card first, money only with finance', () => {
  const s = buildStories(base());
  expect(s.view).toBe('studio');
  const due = s.cards.find((c) => c.id === 'money-due')!;
  expect([due.figure, due.headline]).toEqual(['₹1420000', '2 invoices, ₹310000 of it late']);
  expect(due.reason).toBe('Unique Vistas is 9 days late on Design advance.');
  expect(s.cards[0].weight).toBe(0);
  expect(s.swatches.map((w) => [w.id, w.figure])).toEqual([['booked', '₹1840000'], ['pipeline', '₹2600000'], ['due', '₹1420000'], ['late', '₹310000'], ['approved', '2/3']]);
  expect(s.rings.map((r) => [r.id, r.count])).toEqual([['money', 2], ['design', 2], ['clients', 2], ['site', 1], ['team', 1]]);

  const noMoney = buildStories(base({ finance: false }));
  expect(noMoney.cards.some((c) => c.ring === 'money')).toBe(false);
  expect(JSON.stringify(noMoney)).not.toContain('₹');
  expect(noMoney.swatches.map((w) => [w.id, w.figure])).toEqual([['active', '1'], ['pipeline', '1'], ['waiting', '2'], ['overdue', '1'], ['approved', '2/3']]);
});

test('design, clients, site and team cards say what the data says', () => {
  const s = buildStories(base());
  const card = (id: string) => s.cards.find((c) => c.id === id)!;
  expect(card('design-waiting')).toMatchObject({ figure: '2', headline: 'sheets to review, 1 overdue', reason: "Oldest is Kabir's Wardrobe, 3 days.",
    action: { kind: 'sheet', drawingId: 'Wardrobe', label: 'Start reviewing' } });
  expect(card('design-approved')).toMatchObject({ figure: '2/3', headline: '50% first time' });
  expect(card('clients-confirm')).toMatchObject({ figure: '1', headline: 'meeting with Icon Dhokali' });
  expect(card('clients-week').figure).toBe('2');
  expect(card('site-execution')).toMatchObject({ figure: '1', action: { kind: 'project', projectId: 'p1' } });
  expect(card('team-load')).toMatchObject({ figure: '3', headline: 'sheets with Riya, 1 late', reason: 'Kabir has the fewest (1).' });
  /* Nothing to say, no card: no visits, no sheets. */
  const quiet = buildStories(base({ rows: [], visits: [], payments: [], projects: [] , counts: { active: 0, pipeline: 0, booked: 0, open: 0, winRate: 0 } }));
  expect(quiet.cards).toEqual([]);
  expect(quiet.rings).toEqual([]);
});

test("a designer's view: only their sheets, theirs to fix first", () => {
  const s = buildStories(base({ view: 'designer', finance: false, viewer: { reviewer: false, email: 'riya@s.in' } }));
  expect(s.view).toBe('designer');
  expect(s.cards[0]).toMatchObject({ id: 'sheets-fix', figure: 'Kitchen', headline: 'Round 3 · due tomorrow',
    action: { kind: 'sheet', drawingId: 'Kitchen A', label: 'Open the notes' } });
  expect(s.cards.find((c) => c.id === 'sheets-send')).toMatchObject({ figure: '1', headline: 'Foyer' });
  expect(s.cards.find((c) => c.id === 'reviews-waiting')).toMatchObject({ figure: '1', headline: 'oldest 1 day' });
  expect(s.cards.find((c) => c.id === 'wins-week')).toMatchObject({ figure: '1', headline: '1 of them first time' });
  expect(s.swatches.map((w) => [w.id, w.figure])).toEqual([['fix', '1'], ['waiting', '1'], ['send', '1'], ['approved', '1'], ['due', '2']]);
  expect(s.rings.map((r) => r.id)).toEqual(['sheets', 'reviews', 'meetings', 'wins']);
  expect(JSON.stringify(s)).not.toContain('Wardrobe');
});
