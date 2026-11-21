import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DEFAULT_POLICY, scopeSnapshot, type Attendance, type Snapshot, type Store } from '../../lib/peopleDesk';
import { lanyardsFor, staffToday } from '../../components/people/Arrivals';
import { TeamLanyardRail } from '../../components/ui/team-lanyard-rail';

/*
  The lanyard rail on People → Today (DESIGN.md → "People: the lanyard rail"):
  each badge's colour and times come from the day's attendance, and a badge
  turns over to show them.
*/

const person = (id: string, over: any = {}) => ({ id, name: `${id.toUpperCase()} Person`, title: 'Designer', teamId: 'design', managerId: 'me', accessRole: 'employee' as const, active: true, ...over });
const session = (over: Partial<Attendance>): Attendance => ({ id: `at-${over.employeeId}`, employeeId: 'me', date: '2026-10-07', checkIn: '2026-10-07T05:00:00.000Z', mode: 'Office', site: '', version: 1, ...over });
const s: Snapshot = {
  me: person('me', { accessRole: 'manager', managerId: '' }),
  people: [],
  policy: DEFAULT_POLICY,
  attendance: [],
  requests: [],
  availability: [],
  balances: {},
  serverTime: '2026-10-07T08:00:00.000Z',
  revision: 0,
};
const me = s.me;
const late = person('late');
const home = person('home');
const away = person('away');
const notYet = person('later');
const mine = session({ employeeId: 'me' });
const theirs = session({ employeeId: 'late', checkIn: '2026-10-07T06:30:00.000Z', checkOut: '2026-10-07T12:45:00.000Z', mode: 'Site', site: 'Harmony 704' });

const badges = lanyardsFor(s, {
  scope: [me, late, home, away, notYet],
  arrivals: [{ person: me, session: mine, late: false }, { person: late, session: theirs, late: true }],
  away: new Map([['home', { mode: 'WFH' as const, pending: false }], ['away', { mode: 'Away' as const, pending: false }]]),
});

describe('the badges', () => {
  it('colours each badge by how the day started', () => {
    expect(badges.map((b) => [b.id, b.tone, b.status])).toEqual([
      ['me', 'ok', 'In 10:30 AM'],
      ['late', 'warn', 'Left 6:15 PM'],
      ['home', 'brand', 'From home'],
      ['away', 'slate', 'Away'],
      ['later', 'slate', 'Not yet'],
    ]);
  });

  it('puts in, out, hours and where on the back', () => {
    expect(badges[0].facts).toEqual([
      { label: 'In', value: '10:30 AM', tone: 'slate' },
      { label: 'Out', value: 'Still in', tone: 'ok' },
      { label: 'So far', value: '3h 00m' },
      { label: 'Where', value: 'Office', tone: 'slate' },
    ]);
    expect(badges[1].facts?.map((f) => `${f.label} ${f.value}`)).toEqual(['In 12:00 PM', 'Out 6:15 PM', 'Worked 6h 15m', 'Where Harmony 704']);
    expect(badges[1].facts?.[0].tone).toBe('warn');
  });

  it('says leave is "Away", never why, and when the day starts for those not in yet', () => {
    expect(badges[3].facts?.map((f) => f.value)).toEqual(['Away today']);
    expect(badges[2].facts?.map((f) => f.value)).toEqual(['From home']);
    expect(badges[4].facts?.map((f) => f.value)).toEqual(['Not yet', '10:30 AM']);
    expect(JSON.stringify(badges)).not.toMatch(/sick|casual|planned/i);
  });

  it('marks your own badge', () => {
    expect(badges[0].team).toBe('You');
    expect(badges[1].team).toBe('Harmony 704');
  });
});

describe('staff see who is in, never times (owner, 21 Nov 2026)', () => {
  const staff = (id: string, over: any = {}) => person(id, { managerId: 'boss', ...over });
  const store: Store = {
    people: [staff('boss', { accessRole: 'manager', managerId: '' }), staff('me'), staff('a'), staff('b', { teamId: 'site' }), staff('c'), staff('d'), staff('gone', { active: false })],
    policy: DEFAULT_POLICY,
    attendance: [
      session({ employeeId: 'me' }),
      session({ employeeId: 'a', checkIn: '2026-10-07T07:00:00.000Z' }), // late
      session({ employeeId: 'b', mode: 'Site', site: 'Harmony 704' }),
      session({ employeeId: 'c', mode: 'WFH', checkOut: '2026-10-07T07:30:00.000Z' }),
      session({ employeeId: 'a', id: 'old', date: '2026-10-06' }),
      session({ employeeId: 'gone' }),
    ],
    requests: [], events: [],
  };
  const snap = scopeSnapshot(store, 'me', '2026-10-07T08:00:00.000Z');

  it('sends staff where everyone is today, and nothing else of theirs', () => {
    expect(snap.present).toEqual([
      { employeeId: 'me', mode: 'Office', left: false },
      { employeeId: 'a', mode: 'Office', left: false },
      { employeeId: 'b', mode: 'Site', left: false },
      { employeeId: 'c', mode: 'WFH', left: true },
    ]);
    /* No time, site or session id reaches them through it. */
    expect(JSON.stringify(snap.present)).not.toMatch(/T\d\d:|Harmony|at-/);
    /* Their own sessions only, as before. */
    expect(snap.attendance.map((x) => x.employeeId)).toEqual(['me']);
  });

  it('draws everyone, you first, with no time on anyone else', () => {
    const t = staffToday(snap);
    expect(t.badges.map((b) => [b.id, b.tone, b.status])).toEqual([
      ['me', 'ok', 'In 10:30 AM'],
      ['a', 'ok', 'In'],
      ['b', 'ok', 'On site'],
      ['boss', 'slate', 'Not yet'],
      ['c', 'slate', 'Left'],
      ['d', 'slate', 'Not yet'],
    ]);
    expect(t.badges[2].facts).toEqual([{ label: 'Today', value: 'On site', tone: 'ok' }, { label: 'Team', value: 'Site' }]);
    expect(JSON.stringify(t.badges.slice(1))).not.toMatch(/\d:\d\d|Late|Harmony|Worked|So far/);
    expect({ in: t.inN, home: t.homeN, away: t.awayN, total: t.total }).toEqual({ in: 3, home: 0, away: 0, total: 6 });
  });
});

describe('the rail', () => {
  beforeAll(() => {
    window.matchMedia = window.matchMedia || ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as any;
  });

  it('draws a badge for each person and turns one over to read its times', () => {
    const { container } = render(<TeamLanyardRail items={badges} caption="2 of 5 in." />);
    expect(screen.getByText('2 of 5 in.')).toBeTruthy();
    const badge = screen.getByRole('button', { name: 'LATE Person, Designer, Left 6:15 PM' });
    expect(badge.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(badge); // a keyboard click (detail 0), as Enter gives
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-slot="team-lanyard-rail"]')?.getAttribute('data-flipped')).toBe('1');
    const caption = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(caption).getByText(/In 12:00 PM\. Out 6:15 PM\. Worked 6h 15m\. Where Harmony 704/)).toBeTruthy();
    fireEvent.keyDown(badge, { key: 'Escape' });
    expect(badge.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows initials where there is no photo', () => {
    render(<TeamLanyardRail items={badges.slice(0, 1)} />);
    expect(screen.getAllByText('MP').length).toBeGreaterThan(0);
  });
});
