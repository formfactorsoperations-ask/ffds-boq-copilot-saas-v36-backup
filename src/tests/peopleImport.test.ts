/*
  The People Hub import, on a made-up workbook laid out as People Hub's
  (apps/people-hub/MIGRATION.md): matching, the questions, what is left
  out, the balance comparison, and the server's own check of each record.
*/
import { test, expect } from 'vitest';
import { DEFAULT_POLICY, execute, type Person, type Store } from '../../lib/peopleDesk';
import { myDay } from '../../lib/peopleView';
import { checkImported, dateOf, newBatchId, planImport, secondsOf, stamp, BATCH_ID, type Workbook } from '../../lib/peopleImport';

const policy = { ...structuredClone(DEFAULT_POLICY), holidays: ['2026-10-20'], holidayNames: { '2026-10-20': 'Diwali' } };
const person = (id: string, name: string, email: string, extra: Partial<Person> = {}): Person =>
  ({ id, name, email, title: '', teamId: 'design', managerId: '', accessRole: 'employee', active: true, entitlements: {}, ...extra });
const people = [
  person('mayuri', 'Mayuri', 'mayuri@ffds.in', { accessRole: 'admin' }),
  person('tanvi', 'Tanvi Shah', 'tanvi@ffds.in', { managerId: 'mayuri' }),
  person('sougata', 'Sougata', 'sougata@ffds.in', { managerId: 'mayuri' }),
];
/* 46304 is 9 Oct 2026 as an Excel day; 0.4375 is 10:30. */
const book = (): Workbook => ({
  Team: [
    ['Name', 'Email', 'Role', 'Squad', 'Active', 'isAdmin'],
    ['Mayuri', 'mayuri@ffds.in', 'Founder', 'Design', 'Y', 'TRUE'],
    ['Tanvi', 'TANVI@ffds.in', 'Designer', 'Design', 'Y', 'FALSE'],
    ['Old Hand', 'old@ffds.in', 'Designer', 'Design', 'N', 'FALSE'],
  ],
  Attendance: [
    ['Date', 'Email', 'Name', 'Mode', 'CheckIn', 'CheckOut', 'Late', 'Notes', 'Hours'],
    [46304, 'tanvi@ffds.in', 'Tanvi', 'Office', 0.4375, 0.770833333, 'N', '', 8],
    ['08/10/2026', 'tanvi@ffds.in', 'Tanvi', 'Site', '11:45', '6:30 PM', 'Y', 'Hiranandani', 6.75],
    ['2026-10-07', 'tanvi@ffds.in', 'Tanvi', 'WFH', '10:40', '', 'N', '', ''],
    ['2026-10-06', 'sougata@ffds.in', 'Sougata', 'Office', '10:20', '18:00', 'N', '', ''],
    ['2026-10-06', 'sougata@ffds.in', 'Sougata', 'Office', '10:25', '', 'N', 'double tap', ''],
    ['2026-10-06', 'old@ffds.in', 'Old Hand', 'Office', '10:00', '18:00', 'N', '', ''],
    ['2026-10-05', 'mayuri@ffds.in', 'Mayuri', 'Office', '', '18:00', 'N', '', ''],
    ['', '', '', '', '', '', '', '', ''],
  ],
  Leaves: [
    ['CreatedAt', 'ReqID', 'Name', 'Start', 'End', 'Type', 'Half', 'Reason', 'Status', 'ApprovedBy', 'ApprovedAt'],
    ['2026-09-01T05:00:00.000Z', 'R1', 'Tanvi', '2026-09-14', '2026-09-15', 'PL', 'N', 'Family', 'approved', 'mayuri@ffds.in', '2026-09-02T05:00:00.000Z'],
    ['2026-09-01T05:00:00.000Z', 'R1b', 'Tanvi', '2026-09-14', '2026-09-15', 'PL', 'N', 'Family', 'approved', 'Mayuri', ''],
    ['2026-09-20T05:00:00.000Z', 'R2', 'Tanvi', '2026-09-22', '2026-09-22', 'SL', 'Y', 'Fever', 'approved', 'Mayuri', ''],
    ['2026-10-01T05:00:00.000Z', 'R3', 'Sougata', '2026-10-15', '2026-10-16', 'CL', 'N', '', 'pending', '', ''],
    ['2026-10-01T05:00:00.000Z', 'R4', 'Sougata', '2026-10-01', '2026-10-01', 'WFH', 'N', '', 'rejected', 'Mayuri', ''],
    ['2026-10-01T05:00:00.000Z', 'R5', 'Sougata Das', '2026-10-02', '2026-10-02', 'CL', 'N', '', 'approved', 'Mayuri', ''],
    ['2026-10-01T05:00:00.000Z', 'R6', 'Tanvi', '2026-10-02', '2026-10-02', 'Vacation', 'N', '', 'approved', 'Mayuri', ''],
  ],
  Balances: [
    ['Email', 'Name', 'FY', 'PL_Entitled', 'SL_Entitled', 'CL_Entitled', 'PL_Used', 'SL_Used', 'CL_Used', 'COMP_Earned', 'COMP_Used', 'PL_Rem', 'SL_Rem', 'CL_Rem'],
    ['tanvi@ffds.in', 'Tanvi', 'FY2026-27', 12, 6, 6, 2, 1, 0, 1, 0, 10, 5, 6],
  ],
  Holidays: [['Date', 'Name', 'Type'], ['2026-10-20', 'Diwali', 'Public'], ['2026-11-05', 'Bhai Dooj', 'Office']],
  Settings: [['Key', 'Value'], ['checkin_start', '10:30'], ['checkin_end', '11:30'], ['office_end', '6:30:00 PM'], ['weekly_off', 'Mon']],
});

test('dates and times read the way the workbook writes them', () => {
  expect(dateOf(46304)).toBe('2026-10-09');
  expect(dateOf('08/10/2026')).toBe('2026-10-08');
  expect(dateOf('9-Oct-2026')).toBe('2026-10-09');
  expect(dateOf('2026-02-30')).toBeNull();
  expect(secondsOf(0.4375)).toBe(10.5 * 3600);
  expect(secondsOf('6:30 PM')).toBe(18.5 * 3600);
  expect(secondsOf('18:30:00')).toBe(18.5 * 3600);
  expect(secondsOf('')).toBeNull();
});

test('a dry run matches people by email and plans attendance without inventing times', () => {
  const plan = planImport(book(), people, policy);
  expect(plan.problems).toEqual([]);
  expect(plan.people.map((p) => [p.name, p.personId])).toEqual([['Mayuri', 'mayuri'], ['Tanvi', 'tanvi'], ['Old Hand', null]]);
  expect(plan.people.find((p) => p.name === 'Old Hand')!.attendanceRows).toBe(1);
  const tanvi = plan.attendance.filter((a) => a.employeeId === 'tanvi');
  expect(tanvi.map((a) => a.date)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
  const oct9 = tanvi.find((a) => a.date === '2026-10-09')!;
  expect(oct9.checkIn).toBe('2026-10-09T05:00:00.000Z');
  expect(oct9.checkOut).toBe('2026-10-09T13:00:00.000Z');
  const site = tanvi.find((a) => a.date === '2026-10-08')!;
  expect([site.mode, site.site, site.checkOut]).toEqual(['Site', 'Hiranandani', '2026-10-08T13:00:00.000Z']);
  const wfh = tanvi.find((a) => a.date === '2026-10-07')!;
  expect(wfh.checkOut).toBeUndefined();
  expect(wfh.imported!.flags).toContain('No check-out was recorded');
  expect(plan.counts.noCheckout).toBe(1);
  expect(plan.skipped.map((x) => x.why)).toEqual(expect.arrayContaining(['old@ffds.in is not on your studio team', 'No check-in time']));
});

test('two rows for one day: the complete one is kept unless the admin picks the other', () => {
  const plan = planImport(book(), people, policy);
  const q = plan.questions.find((x) => x.kind === 'duplicate')!;
  expect(q.id).toBe('sougata:2026-10-06');
  expect(q.answer).toBe('5');
  expect(plan.attendance.find((a) => a.employeeId === 'sougata')!.checkOut).toBeDefined();
  const picked = planImport(book(), people, policy, { keepRow: { 'sougata:2026-10-06': 6 } });
  expect(picked.attendance.find((a) => a.employeeId === 'sougata')!.checkOut).toBeUndefined();
  expect(picked.attendance.filter((a) => a.employeeId === 'sougata')).toHaveLength(1);
});

test('leave: names matched exactly, half days asked, twins brought over once', () => {
  const plan = planImport(book(), people, policy);
  /* The half day must be answered before saving. */
  expect(plan.blocking).toBe(1);
  expect(plan.questions.find((q) => q.kind === 'half')!.id).toBe('4');
  /* "Sougata Das" is nobody's exact name: asked, and left out until answered. */
  const name = plan.questions.find((q) => q.kind === 'name')!;
  expect(name.id).toBe('sougata das');
  expect(plan.skipped.find((x) => x.row === 7 && x.tab === 'Leaves')!.why).toMatch(/not matched/);
  expect(plan.skipped.find((x) => x.row === 3 && x.tab === 'Leaves')!.why).toBe('The same request as row 2');
  expect(plan.skipped.find((x) => x.row === 8 && x.tab === 'Leaves')!.why).toMatch(/Unknown leave type/);

  const answered = planImport(book(), people, policy, { halfOf: { 4: 'Second half' }, nameTo: { 'sougata das': 'sougata' } });
  expect(answered.blocking).toBe(0);
  const ids = answered.requests.map((r) => r.id);
  expect(ids).toEqual(['ph_rq_R1', 'ph_rq_R2', 'ph_rq_R3', 'ph_rq_R4', 'ph_rq_R5']);
  const pl = answered.requests[0];
  expect(pl.days.map((d) => d.date)).toEqual(['2026-09-15']); /* the 14th is a Monday, the weekly off */
  expect(pl.decisions).toEqual([{ actorId: 'mayuri', at: '2026-09-02T05:00:00.000Z', status: 'Approved', note: 'Decided in People Hub by mayuri@ffds.in.' }]);
  expect(answered.requests[1]).toMatchObject({ portion: 'Second half', days: [{ date: '2026-09-22', units: 0.5 }] });
  expect(answered.requests[2]).toMatchObject({ status: 'Pending', decisions: [] });
  expect(answered.counts.byStatus).toEqual({ Approved: 3, Pending: 1, Rejected: 1 });
});

test("People Hub's balances are compared, not applied; comp-off earned is offered", () => {
  const plan = planImport(book(), people, policy, { halfOf: { 4: 'First half' } });
  const pl = plan.recon.find((r) => r.type === 'PL')!;
  expect([pl.fy, pl.hubUsed, pl.used, pl.agrees]).toEqual(['2026', 2, 1, false]);
  const sl = plan.recon.find((r) => r.type === 'SL')!;
  expect([sl.hubUsed, sl.used, sl.agrees]).toEqual([1, 0.5, false]);
  expect(plan.recon.find((r) => r.type === 'CL')!.agrees).toBe(true);
  expect(plan.compGrants).toEqual([{ personId: 'tanvi', name: 'Tanvi Shah', fy: '2026', earned: 1, current: null }]);
  expect(plan.holidays).toEqual([{ date: '2026-11-05', name: 'Bhai Dooj' }]);
  expect(plan.settings.map((x) => [x.label, x.hub, x.same])).toEqual([['Day starts', '10:30', true], ['Late after', '11:30', true], ['Day ends', '18:30', true], ['Weekly off', 'Mon', true]]);
});

test('an imported day with no check-out never blocks the next check-in', () => {
  const plan = planImport(book(), people, policy, { halfOf: { 4: 'First half' } });
  const store: Store = { people, policy, attendance: plan.attendance, requests: plan.requests, events: [] };
  const ev = execute(store, 'tanvi', { id: 'cmd-checkin-1', action: 'checkin', data: { mode: 'WFH' } }, '2026-10-13T05:00:00.000Z');
  expect(ev.session!.date).toBe('2026-10-13');
  const day = myDay({ me: people[1], attendance: plan.attendance, serverTime: '2026-10-13T05:00:00.000Z', policy } as any);
  expect(day.stale).toBeNull();
});

test('the server checks every record and accepts only what an import makes', () => {
  const batch = newBatchId(new Date('2026-10-12T06:30:05Z'));
  expect(batch).toMatch(BATCH_ID);
  expect(batch.startsWith('ph-20261012-120005-')).toBe(true);
  const plan = planImport(book(), people, policy, { halfOf: { 4: 'First half' }, nameTo: { 'sougata das': 'sougata' } }, batch);
  const { attendance, requests } = stamp(plan, batch);
  const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  for (const a of attendance) expect(checkImported('attendance', json(a), batch, people)).toBeNull();
  for (const r of requests) expect(checkImported('request', json(r), batch, people)).toBeNull();
  const a = json(attendance[0]);
  expect(checkImported('attendance', { ...a, id: 'at_live_one' }, batch, people)).toBe('Bad ID.');
  expect(checkImported('attendance', { ...a, checkInLocation: { lat: 1, lng: 1 } }, batch, people)).toMatch(/location/);
  expect(checkImported('attendance', { ...a, extra: 1 }, batch, people)).toBe('Unexpected field.');
  expect(checkImported('attendance', { ...a, imported: { ...a.imported, batch: 'ph-other' } }, batch, people)).toBe('Bad source.');
  expect(checkImported('attendance', { ...a, employeeId: 'stranger' }, batch, people)).toBe('Not on the studio team.');
  const r = json(requests[0]);
  expect(checkImported('request', { ...r, status: 'Cancellation requested' }, batch, people)).toBe('Bad status.');
  expect(checkImported('request', { ...r, days: [{ date: '2026-12-01', units: 1 }] }, batch, people)).toBe('Bad days.');
  expect(checkImported('request', { ...r, decisions: [{ ...r.decisions[0], actorId: 'stranger' }] }, batch, people)).toBe('Bad decision.');
  /* The same workbook gives the same IDs, so importing it again updates rather than duplicates. */
  expect(planImport(book(), people, policy, { halfOf: { 4: 'First half' } }).attendance.map((x) => x.id)).toEqual(plan.attendance.map((x) => x.id));
});
