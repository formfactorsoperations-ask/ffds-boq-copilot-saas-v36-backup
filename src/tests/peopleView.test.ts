import { describe, it, expect } from 'vitest';
import { DEFAULT_POLICY, type Snapshot, type Attendance } from '../../lib/peopleDesk';
import {
  myDay, minutesWorked, duration, dayProgress, whereLabel, awaitingMe, monthGrid, shiftMonth, awayOn, dayKind, monthReport, attendanceCsv, newCommandId,
} from '../../lib/peopleView';

const policy = { ...DEFAULT_POLICY, holidays: ['2026-10-20'] };
const person = (id: string, over: any = {}) => ({ id, name: id.toUpperCase(), title: '', teamId: 'design', managerId: '', accessRole: 'employee' as const, active: true, ...over });
const session = (over: Partial<Attendance>): Attendance => ({ id: 'at1', employeeId: 'me', date: '2026-10-07', checkIn: '2026-10-07T05:00:00.000Z', mode: 'Office', site: '', version: 1, ...over });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  me: person('me', { accessRole: 'manager' }), people: [person('me'), person('t', { managerId: 'me' }), person('x')],
  policy, attendance: [], requests: [], availability: [], balances: {}, serverTime: '2026-10-07T08:00:00.000Z', revision: 0, ...over,
});

describe('the working day', () => {
  it("finds today's session and one left open from an earlier day", () => {
    const s = snap({ attendance: [session({}), session({ id: 'old', date: '2026-10-05' })] });
    expect(myDay(s)).toMatchObject({ today: '2026-10-07', session: { id: 'at1' }, stale: { id: 'old' } });
  });

  it('counts hours, and how far through the day it is', () => {
    expect(minutesWorked(session({}), '2026-10-07T08:00:00.000Z')).toBe(180);
    expect(minutesWorked(session({ checkOut: '2026-10-07T12:45:00.000Z' }), '2026-10-07T20:00:00.000Z')).toBe(465);
    expect(duration(465)).toBe('7h 45m');
    expect(dayProgress(policy, '2026-10-07T05:00:00.000Z')).toBe(0); // 10:30 IST
    expect(dayProgress(policy, '2026-10-07T09:00:00.000Z')).toBe(0.5); // 14:30 IST
    expect(dayProgress(policy, '2026-10-07T15:00:00.000Z')).toBe(1);
  });

  it('says where a check-in was', () => {
    expect(whereLabel({ lat: 0, lng: 0, accuracyM: 10, distanceM: 40, atOffice: true }, 'Office')).toBe('At the office');
    expect(whereLabel({ lat: 0, lng: 0, accuracyM: 10, distanceM: 640, atOffice: false }, 'Office')).toBe('640 m from the office');
    expect(whereLabel({ lat: 0, lng: 0, accuracyM: 10, distanceM: 12400, atOffice: false }, 'Site')).toBe('12.4 km from the office');
    expect(whereLabel(null, 'Site')).toBe('No location shared');
    expect(whereLabel(null, 'WFH')).toBe('Working from home');
  });
});

describe('leave and approvals', () => {
  const req = (over: any) => ({ id: 'r', employeeId: 't', kind: 'leave', type: 'PL', start: '2026-10-08', end: '2026-10-08', portion: 'Full day', days: [{ date: '2026-10-08', units: 1 }], reason: '', status: 'Pending', version: 1, createdAt: '2026-10-06T00:00:00Z', decisions: [], ...over });
  it('shows a manager what waits for them, never their own', () => {
    const s = snap({ requests: [req({ id: 'a' }), req({ id: 'b', employeeId: 'me' }), req({ id: 'c', status: 'Approved' }), req({ id: 'd', status: 'Cancellation requested' })] as any });
    expect(awaitingMe(s).map((r) => r.id)).toEqual(['a', 'd']);
    expect(awaitingMe({ ...s, me: { ...s.me, accessRole: 'employee' } })).toEqual([]);
  });
});

describe('the calendar', () => {
  it('lays out a month Monday first, and steps between months', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks[weeks.length - 1][6]).toBe('2026-11-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('marks holidays and offs, and who is away on a working day', () => {
    expect(dayKind(policy, '2026-10-20')).toBe('holiday');
    expect(dayKind(policy, '2026-10-12')).toBe('off'); // Monday
    expect(dayKind(policy, '2026-10-11')).toBe('off'); // 2nd Sunday
    expect(dayKind(policy, '2026-10-08')).toBe('work');
    const s = snap({ availability: [{ requestId: 'r', employeeId: 'x', start: '2026-10-08', end: '2026-10-13', portion: 'Full day', status: 'Pending', mode: 'Away' }] });
    expect(awayOn(s, '2026-10-08')).toEqual([{ personId: 'x', name: 'X', mode: 'Away', portion: 'Full day', pending: true }]);
    expect(awayOn(s, '2026-10-12')).toEqual([]);
  });
});

describe('the attendance report', () => {
  const s = snap({
    attendance: [
      session({ employeeId: 't', checkIn: '2026-10-07T06:10:00.000Z', checkOut: '2026-10-07T13:10:00.000Z', checkInLocation: { lat: 1, lng: 2, accuracyM: 5, distanceM: 30, atOffice: true } }),
      session({ id: 'a2', employeeId: 't', date: '2026-10-08', mode: 'Site', site: 'Kapoor, "Villa"', checkIn: '2026-10-08T04:50:00.000Z' }),
      session({ id: 'a3', employeeId: 'me', date: '2026-10-08', mode: 'WFH', checkIn: '2026-10-08T05:00:00.000Z', checkOut: '2026-10-08T13:00:00.000Z' }),
    ],
    requests: [{ id: 'r', employeeId: 't', kind: 'leave', type: 'SL', start: '2026-10-09', end: '2026-10-09', portion: 'First half', days: [{ date: '2026-10-09', units: 0.5 }], reason: 'x', status: 'Approved', version: 2, createdAt: '', decisions: [] }] as any,
  });

  it('counts each person in scope for the month', () => {
    const rows = monthReport(s, '2026-10');
    expect(rows.map((r) => r.person.id)).toEqual(['me', 't']);
    expect(rows[1]).toMatchObject({ present: 2, office: 1, site: 1, late: 1, open: 1, minutes: 420, awayDays: 0.5 });
    expect(rows[0]).toMatchObject({ present: 1, wfh: 1, minutes: 480 });
  });

  it('exports a spreadsheet, quoting what needs it', () => {
    const csv = attendanceCsv(s, '2026-10').split('\n');
    expect(csv[0]).toMatch(/^Date,Name,Mode,Site,Check-in/);
    expect(csv[1]).toBe('2026-10-07,T,Office,,11:40,18:40,7.00,Yes,At the office,30');
    expect(csv[3]).toContain('"Kapoor, ""Villa"""');
    expect(newCommandId()).toMatch(/^[a-zA-Z0-9_-]{8,100}$/);
  });
});
