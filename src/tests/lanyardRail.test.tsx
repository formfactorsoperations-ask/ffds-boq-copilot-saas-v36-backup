import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DEFAULT_POLICY, type Attendance, type Snapshot } from '../../lib/peopleDesk';
import { lanyardsFor, teamLanyards } from '../../components/people/Arrivals';
import { guideLanyards } from '../../components/people/OfficeGuide';
import type { GuideEntry } from '../../lib/peopleGuide';
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

describe('Home: Team today', () => {
  const entry = (id: string, over: Partial<GuideEntry> = {}): GuideEntry => ({ id, name: `${id.toUpperCase()} Person`, title: 'Designer', teamId: 'design', email: `${id}@studio.in`, desk: '', computer: '', mobile: '', ext: '', birthday: '', showBirthday: true, joinedOn: '', ...over });
  const people = [s.me, late, home, person('peer', { managerId: 'boss' }), person('gone', { active: false })];
  const snap = (role: string): Snapshot => ({
    ...s, me: { ...s.me, accessRole: role as any }, people: people.map((p) => (p.id === 'me' ? { ...p, accessRole: role as any } : p)),
    attendance: [mine, theirs, session({ employeeId: 'peer' })],
    availability: [{ id: 'av', employeeId: 'home', start: '2026-10-07', end: '2026-10-07', mode: 'WFH', portion: 'Full day', status: 'Approved' } as any],
  });

  it('shows everyone active, you first, with times only for those you look after', () => {
    const b = teamLanyards(snap('manager'), [entry('peer', { desk: 'D-04', ext: '214' })]);
    expect(b.map((x) => x.id)).toEqual(['me', 'home', 'late', 'peer']);
    expect(b.find((x) => x.id === 'late')?.status).toBe('Left 6:15 PM');
    /* Not one of this manager's reports: no times, and never "Not yet". */
    expect(b.find((x) => x.id === 'peer')).toMatchObject({ tone: 'brand', status: 'Working today', facts: [{ label: 'Today', value: 'Working' }, { label: 'Desk', value: 'D-04' }, { label: 'Ext.', value: '214' }] });
    expect(b.find((x) => x.id === 'home')).toMatchObject({ tone: 'brand', status: 'From home' });
  });

  it('gives admins everyone\'s times', () => {
    expect(teamLanyards(snap('admin')).find((x) => x.id === 'peer')?.status).toBe('In 10:30 AM');
  });
});

describe('Office guide: lanyards', () => {
  const e: GuideEntry = { id: 'p', name: 'Priya Shah', title: 'Senior Designer', teamId: 'design', email: 'priya@studio.in', desk: 'D-04', computer: 'FF-PC-07', mobile: '+91 98200 11223', ext: '214', birthday: '10-22', showBirthday: true, joinedOn: '' };
  it('puts desk, extension, mobile and birthday on the back, with Call and Email', () => {
    const [b] = guideLanyards([e], new Map([['p', { label: 'In since 9:42 AM', tint: '', dot: '', here: true, live: true, short: 'In 9:42 AM', tone: 'ok' as const }]]), 'me');
    expect(b).toMatchObject({ tone: 'ok', status: 'In 9:42 AM', role: 'Senior Designer' });
    expect(b.facts?.map((f) => `${f.label} ${f.value}`)).toEqual(['Desk D-04', 'Ext. 214', 'Mobile +91 98200 11223', 'Birthday 22 Oct']);
    expect(b.links).toEqual([{ label: 'Call', href: 'tel:+919820011223' }, { label: 'Email', href: 'mailto:priya@studio.in' }]);
  });
  it('stays in the brand with no chip when People does not say', () => {
    const [b] = guideLanyards([{ ...e, mobile: '', email: '' }], new Map(), 'p');
    expect(b).toMatchObject({ tone: 'brand', status: undefined, role: 'Senior Designer (you)', links: [] });
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
