/*
  Home widgets: what each one shows (lib/homeWidgets.ts).
*/
import { test, expect } from 'vitest';
import { mySheets, reviewInbox, upcoming, whenLabel, teamToday } from '../../lib/homeWidgets';
import { DEFAULT_POLICY, scopeSnapshot, type Store } from '../../lib/peopleDesk';
import type { DeskRow } from '../../lib/designDesk';

const NOW = new Date('2026-10-14T10:00:00+05:30');
const day = (d: string) => new Date(`${d}T10:00:00+05:30`).getTime();
const sheet = (id: string, state: string, extra: Partial<DeskRow> = {}, review: any = {}): DeskRow => ({
  id, projectId: 'p1', name: id, ...extra,
  review: { state, designer: { email: 'tanvi@s.in', name: 'Tanvi', uid: 'u' }, updatedAt: 1, submittedAt: null, decidedAt: null, ...review } as any,
});

test('my sheets: fixes first, then drafts, the most urgent first', () => {
  const rows = [
    sheet('a', 'DRAFT', { targetDate: '2026-10-30' }),
    sheet('b', 'CHANGES_REQUESTED', { targetDate: '2026-10-20' }),
    sheet('c', 'CHANGES_REQUESTED', { targetDate: '2026-10-10' }),
    sheet('d', 'IN_REVIEW'),
    sheet('e', 'DRAFT', {}, { designer: { email: 'someone@s.in' } }),
    sheet('f', 'DRAFT', { targetDate: '2026-10-15' }),
  ];
  const m = mySheets(rows, { reviewer: false, email: 'tanvi@s.in' }, NOW);
  expect(m.fix.map((d) => d.id)).toEqual(['c', 'b']);
  expect(m.drafts.map((d) => d.id)).toEqual(['f', 'a']);
  expect(m.waiting.map((d) => d.id)).toEqual(['d']);
  expect(m.top.map((d) => d.id)).toEqual(['c', 'b', 'f']);
  expect(mySheets(rows, { reviewer: false, email: '' }, NOW).top).toEqual([]);
});

test('the review inbox: waiting, overdue, oldest, client changes and the week of approvals', () => {
  const rows = [
    sheet('w1', 'IN_REVIEW', { targetDate: '2026-10-12' }, { submittedAt: day('2026-10-09') }),
    sheet('w2', 'IN_REVIEW', {}, { submittedAt: day('2026-10-13') }),
    sheet('a1', 'APPROVED', {}, { decidedAt: day('2026-10-14') }),
    sheet('a2', 'APPROVED', {}, { decidedAt: day('2026-10-10') }),
    sheet('a3', 'APPROVED', {}, { decidedAt: day('2026-10-01'), clientChanges: { pending: true } }),
    sheet('c1', 'CHANGES_REQUESTED'),
  ];
  const r = reviewInbox(rows, { reviewer: true, email: 'head@s.in' }, NOW);
  expect(r.waiting.map((d) => d.id)).toEqual(['w1', 'w2']);
  expect(r.overdue).toBe(1);
  expect(r.oldestDays).toBe(5);
  expect(r.clientChanges).toBe(1);
  expect(r.approvedByDay).toEqual([0, 0, 1, 0, 0, 0, 1]);
  expect(r.approvedWeek).toBe(2);
  expect(r.needs).toBe(3);
  expect(r.stats).toMatchObject({ total: 6, approved: 3, review: 2, changes: 1 });
  expect(reviewInbox([], { reviewer: true, email: '' }, NOW).oldestDays).toBeNull();
});

test('upcoming meetings and visits: booked ones in the next two weeks, soonest first', () => {
  const v = (id: string, status: string, date: string | null, time = '11:00') =>
    ({ id, status, slot: date ? { date, time } : null, kind: 'meeting', projectName: 'Kapoor Villa' }) as any;
  const list = upcoming([
    v('a', 'confirmed', '2026-10-20', '15:00'), v('b', 'requested', '2026-10-14', '17:00'), v('c', 'done', '2026-10-15'),
    v('d', 'cancelled', '2026-10-16'), v('e', 'rescheduled', '2026-10-20', '10:00'), v('f', 'confirmed', '2026-11-30'),
    v('g', 'confirmed', '2026-10-13'), v('h', 'requested', null),
  ], '2026-10-14');
  expect(list.map((u) => u.visit.id)).toEqual(['b', 'e', 'a']);
  expect(list.map((u) => u.daysAway)).toEqual([0, 6, 6]);
  expect(whenLabel(list[0])).toBe('Today');
  expect(whenLabel({ daysAway: 1, date: '2026-10-15' })).toBe('Tomorrow');
});

test('the team today: away and from home, never why, and the next holiday', () => {
  const person = (id: string, name: string) => ({ id, name, title: '', teamId: 'design', managerId: id === 'm' ? '' : 'm', accessRole: 'employee' as const, active: true });
  const store: Store = {
    policy: { ...structuredClone(DEFAULT_POLICY), holidays: ['2026-10-20', '2026-11-09'], holidayNames: { '2026-10-20': 'Dussehra' } },
    people: [person('m', 'Mayuri'), person('t', 'Tanvi'), person('s', 'Sougata'), person('r', 'Riya')],
    attendance: [],
    requests: [
      { id: 'r1', employeeId: 't', kind: 'leave', type: 'PL', start: '2026-10-14', end: '2026-10-15', portion: 'Full day', days: [], reason: 'Wedding', status: 'Approved', version: 2, createdAt: '', decisions: [] },
      { id: 'r2', employeeId: 's', kind: 'leave', type: 'WFH', start: '2026-10-14', end: '2026-10-14', portion: 'Full day', days: [], reason: '', status: 'Approved', version: 2, createdAt: '', decisions: [] },
      { id: 'r3', employeeId: 'r', kind: 'leave', type: 'CL', start: '2026-10-14', end: '2026-10-14', portion: 'Full day', days: [], reason: '', status: 'Pending', version: 1, createdAt: '', decisions: [] },
    ],
    events: [],
  };
  /* Riya sees the team as anyone does: availability only. */
  const t = teamToday(scopeSnapshot(store, 'r', '2026-10-14T05:00:00.000Z'));
  expect(t.today).toBe('2026-10-14');
  expect(t.away.map((a) => a.name)).toEqual(['Tanvi']);
  expect(t.home.map((a) => a.name)).toEqual(['Sougata']);
  expect(t.asked.map((a) => a.name)).toEqual(['Riya']);
  expect(t.team).toBe(4);
  expect(t.nextHoliday).toEqual({ date: '2026-10-20', name: 'Dussehra', days: 6 });
  expect(JSON.stringify(t)).not.toContain('Wedding');
});
