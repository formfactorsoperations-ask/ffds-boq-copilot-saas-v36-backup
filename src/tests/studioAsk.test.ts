/*
  Home: "Ask the studio" (lib/studioAsk.ts) and 12-hour times (lib/peopleDesk.ts).
*/
import { test, expect } from 'vitest';
import { studioRecord, suggestionsFor } from '../../lib/studioAsk';
import { clock12 } from '../../lib/peopleDesk';

const base = {
  view: 'studio' as const, today: '2026-10-14',
  projects: [{ id: 'p1', context: { name: 'Harmony 704', clientName: 'Mr Rao', status: 'execution', targetHandoverDate: '2026-12-01' } },
    { id: 'p2', context: { name: 'Old Job', status: 'lost' } }],
  rows: [{ id: 'd1', projectId: 'p1', name: 'Kitchen A', roomName: 'Kitchen', targetDate: '2026-10-15', review: { state: 'IN_REVIEW', designer: { name: 'Riya' } } } as any],
  visits: [], attention: [], team: null,
  payments: [{ key: 'k', kind: 'payment', projectId: 'p1', projectName: 'Harmony 704', label: 'Execution advance', since: 0, days: 9, amount: 310000, overdueDays: 9, reminders: 2, lastChaseAt: null } as any],
  money: (n: number) => `₹${n}`,
};

test('money goes in only for finance roles; lost projects stay out', () => {
  const open = JSON.parse(studioRecord({ ...base, finance: true }));
  expect(open.owed[0]).toMatchObject({ project: 'Harmony 704', amount: '₹310000', overdueDays: 9 });
  expect(open.projects.map((p: any) => p.name)).toEqual(['Harmony 704']);
  expect(open.sheets[0]).toMatchObject({ sheet: 'Kitchen A', project: 'Harmony 704', state: 'with the reviewer', designer: 'Riya' });
  const closed = JSON.parse(studioRecord({ ...base, finance: false }));
  expect(closed.owed).toBeUndefined();
  expect(JSON.stringify(closed)).not.toContain('310000');
});

test('suggestions follow who is asking', () => {
  expect(suggestionsFor('studio', true)[0]).toBe('Who owes us money?');
  expect(suggestionsFor('studio', false)[0]).toBe('Which projects are blocked?');
  expect(suggestionsFor('designer', false)[0]).toBe('What is due this week?');
});

test('times read on the 12-hour clock', () => {
  expect(clock12('09:42')).toBe('9:42 AM');
  expect(clock12('00:05')).toBe('12:05 AM');
  expect(clock12('12:30')).toBe('12:30 PM');
  expect(clock12('23:21')).toBe('11:21 PM');
  expect(clock12('2026-10-14T04:12:00.000Z', 'Asia/Kolkata')).toBe('9:42 AM');
  expect(clock12(null)).toBe('—');
});
