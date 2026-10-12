/*
  Home: "Your day, in order" (lib/homeDay.ts).
*/
import { test, expect } from 'vitest';
import { checkInOf, dayOrder, dayTitle } from '../../lib/homeDay';
import { DEFAULT_POLICY } from '../../lib/peopleDesk';
import type { DeskRow } from '../../lib/designDesk';
import type { TeamToday, Upcoming } from '../../lib/homeWidgets';

const NOW = new Date('2026-10-14T10:00:00+05:30');
const ME = 'tanvi@s.in';
const sheet = (id: string, state: string, extra: Partial<DeskRow> = {}, review: any = {}): DeskRow => ({
  id, projectId: 'p1', name: id, ...extra,
  review: { state, designer: { email: ME, name: 'Tanvi', uid: 'u' }, updatedAt: 1, submittedAt: null, decidedAt: null, ...review } as any,
});
const visit = (daysAway: number): Upcoming => ({ visit: { id: `v${daysAway}`, kind: 'meeting', status: 'confirmed' } as any, date: '2026-10-14', time: '11:00', daysAway });
const team = (over: Partial<TeamToday> = {}): TeamToday => ({ today: '2026-10-14', away: [], home: [], asked: [], team: 6, nextHoliday: null, ...over });
const designer = { reviewer: false, email: ME };
const head = { reviewer: true, email: 'mayuri@s.in' };

test('a meeting today comes first; then late fixes, then reviews, then the team', () => {
  const rows = [sheet('a', 'CHANGES_REQUESTED', { targetDate: '2026-10-10' }), sheet('b', 'IN_REVIEW', {}, { submittedAt: NOW.getTime() })];
  const d = dayOrder({ rows, reviewer: true, viewer: { ...head, email: ME }, visits: [visit(0)], team: team(), now: NOW });
  expect(d.pins.map((p) => p.kind)).toEqual(['meetings', 'sheets', 'reviews', 'team']);
  expect(d.toDo).toBe(3);
  expect(d.pins.map((p) => p.why)).toEqual(['Today', 'Late', 'Waiting on you', 'Everyone in']);
});

test('nothing to do keeps the usual order and says so', () => {
  const d = dayOrder({ rows: [], reviewer: true, viewer: head, visits: [], team: team(), now: NOW });
  expect(d.pins.map((p) => p.kind)).toEqual(['sheets', 'reviews', 'meetings', 'team']);
  expect(d.toDo).toBe(0);
  expect(d.pins[0].why).toBe('Yours: all clear');
  expect(dayTitle(0)).toMatch(/Nothing pressing/);
  expect(dayTitle(1)).toBe('One thing first, then the rest');
  expect(dayTitle(3)).toBe('Three things, in the order that saves you time');
});

test('a designer sees no review inbox; a draft to send outranks a meeting next week', () => {
  const d = dayOrder({ rows: [sheet('a', 'DRAFT')], reviewer: false, viewer: designer, visits: [visit(5)], now: NOW });
  expect(d.pins.map((p) => p.kind)).toEqual(['sheets', 'meetings']);
  expect(d.pins.map((p) => p.weight)).toEqual([50, 15]);
});

test('a day off asked for today needs a decision; someone away is only worth knowing', () => {
  const asked = [{ personId: 'r', name: 'Riya', mode: 'Away', pending: true }] as any;
  expect(dayOrder({ team: team({ asked }) }).pins[0]).toEqual({ kind: 'team', weight: 48, why: 'Asked off today' });
  expect(dayOrder({ team: team({ away: asked }) }).pins[0].weight).toBe(10);
  /* Loading pins stay in place with no weight. */
  expect(dayOrder({ rows: null, reviewer: true, viewer: head, visits: null, team: null }).pins.map((p) => p.weight + p.why)).toEqual(['0', '0', '0', '0']);
});

test('checking in is pin 01 until done, then steps to the end', () => {
  const rows = [sheet('a', 'DRAFT')];
  const before = dayOrder({ rows, viewer: designer, checkin: { state: 'out' }, attention: { blocked: 1, due: 0 }, now: NOW });
  expect(before.pins.map((p) => p.kind)).toEqual(['checkin', 'attention', 'sheets']);
  expect(before.pins[0].why).toBe('Start here');
  expect(before.toDo).toBe(3);
  const after = dayOrder({ rows, viewer: designer, checkin: { state: 'in', since: '09:42' }, attention: { blocked: 0, due: 2 }, now: NOW });
  expect(after.pins.map((p) => p.kind)).toEqual(['attention', 'sheets', 'checkin']);
  expect(after.pins.map((p) => p.why)).toEqual(['Next up', 'Ready to send', 'In since 09:42']);
  expect(dayOrder({ checkin: { state: 'off' } }).pins[0].why).toBe('Day off');
});

test('where the working day stands, from the People snapshot', () => {
  const base: any = {
    me: { id: 'e1' }, serverTime: '2026-10-14T05:00:00.000Z', attendance: [], availability: [],
    policy: { ...DEFAULT_POLICY, holidays: [] },
  };
  const today = '2026-10-14';
  const at = (over: any) => ({ ...base, ...over });
  expect(checkInOf(at({})).state).toBe('out');
  expect(checkInOf(at({ attendance: [{ employeeId: 'e1', date: today, checkIn: '2026-10-14T04:12:00.000Z' }] }))).toEqual({ state: 'in', since: '09:42' });
  expect(checkInOf(at({ attendance: [{ employeeId: 'e1', date: today, checkIn: '2026-10-14T04:12:00.000Z', checkOut: '2026-10-14T12:00:00.000Z' }] })).state).toBe('done');
  expect(checkInOf(at({ policy: { ...base.policy, holidays: [today] } })).state).toBe('off');
  expect(checkInOf(at({ availability: [{ employeeId: 'e1', start: today, end: today, status: 'Approved', mode: 'Away' }] })).state).toBe('off');
  expect(checkInOf(at({ availability: [{ employeeId: 'e1', start: today, end: today, status: 'Approved', mode: 'WFH' }] })).state).toBe('out');
});
