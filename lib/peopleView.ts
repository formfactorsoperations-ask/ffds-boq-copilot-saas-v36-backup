/*
  What the People screens show, worked out from a snapshot (lib/peopleDesk.ts):
  today's session, hours, how far from the office, the month calendar, who
  is away on a day, what is waiting for approval, and the attendance report
  and its CSV. Pure, so the tests run it.
*/
import {
  LEAVE_LABELS, addDays, businessDate, fiscalYear, isLate, isOff, timeLabel,
  type Attendance, type LeaveType, type Located, type Mode, type Person, type Policy, type RequestRecord, type Snapshot,
} from './peopleDesk';

export const todayOf = (s: Pick<Snapshot, 'serverTime' | 'policy'>) => businessDate(s.serverTime, s.policy.timezone);

/** Today's session for the signed-in person, and any session still open from an earlier day. */
export function myDay(s: Snapshot): { today: string; session: Attendance | null; stale: Attendance | null } {
  const today = todayOf(s);
  const mine = s.attendance.filter((a) => a.employeeId === s.me.id);
  return {
    today,
    session: mine.find((a) => a.date === today) || null,
    stale: mine.find((a) => a.date < today && !a.checkOut) || null,
  };
}

/** Minutes between check-in and check-out, or until now while still checked in. */
export function minutesWorked(a: Pick<Attendance, 'checkIn' | 'checkOut'>, nowIso: string): number {
  const end = a.checkOut ? Date.parse(a.checkOut) : Date.parse(nowIso);
  return Math.max(0, Math.round((end - Date.parse(a.checkIn)) / 60000));
}
export const duration = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** How far through the studio's working day it is, 0 to 1, in the studio's time. */
export function dayProgress(policy: Policy, nowIso: string): number {
  const now = minutesOf(timeLabel(nowIso, policy.timezone));
  const start = minutesOf(policy.start), end = minutesOf(policy.end);
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** "At the office", "2.4 km from the office", or why there is no location. */
export function whereLabel(loc: Located | null | undefined, mode: Mode): string {
  if (mode === 'WFH') return 'Working from home';
  if (!loc) return 'No location shared';
  if (loc.atOffice) return 'At the office';
  if (loc.distanceM == null) return 'Location recorded';
  return loc.distanceM < 1000 ? `${loc.distanceM} m from the office` : `${(loc.distanceM / 1000).toFixed(1)} km from the office`;
}
export const mapLink = (loc: Pick<Located, 'lat' | 'lng'>) => `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

/* ── Leave ───────────────────────────────────────────────────────────────── */

export const CHARGED: LeaveType[] = ['PL', 'SL', 'CL', 'COMP'];
export const leaveLabel = (t: LeaveType) => LEAVE_LABELS[t];
export const fyLabel = (fy: string) => `FY ${fy}–${String(Number(fy) + 1).slice(2)}`;
export const currentFy = (s: Snapshot) => fiscalYear(todayOf(s), s.policy);
export const isActiveLeave = (r: Pick<RequestRecord, 'status'>) => ['Pending', 'Approved', 'Cancellation requested'].includes(r.status);
export const unitsOf = (r: Pick<RequestRecord, 'days'>) => r.days.reduce((n, d) => n + d.units, 0);

/** What is waiting for this person's decision: their reports' (or everyone's) pending requests and cancellations. */
export function awaitingMe(s: Snapshot): RequestRecord[] {
  if (s.me.accessRole === 'employee') return [];
  return s.requests
    .filter((r) => r.employeeId !== s.me.id && (r.status === 'Pending' || r.status === 'Cancellation requested'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const personName = (s: Pick<Snapshot, 'people' | 'me'>, id: string) =>
  (id === s.me.id ? s.me : s.people.find((p) => p.id === id))?.name || 'Someone';

/* ── The calendar ────────────────────────────────────────────────────────── */

/** The weeks of a month (YYYY-MM), Monday first, padded with the neighbouring days. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  let d = addDays(first, -dow);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(d); d = addDays(d, 1); }
    weeks.push(week);
  } while (d.slice(0, 7) === month);
  return weeks;
}
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};

export interface DayAway { personId: string; name: string; mode: 'Away' | 'WFH'; portion: string; pending: boolean }
/** Who is away or working from home on a day, from the availability everyone may see. */
export function awayOn(s: Snapshot, date: string): DayAway[] {
  return s.availability
    .filter((a) => a.start <= date && a.end >= date && !isOff(date, s.policy))
    .map((a) => ({ personId: a.employeeId, name: personName(s, a.employeeId), mode: a.mode, portion: a.portion, pending: a.status === 'Pending' }));
}
export const dayKind = (policy: Policy, date: string): 'holiday' | 'off' | 'work' =>
  policy.holidays.includes(date) ? 'holiday' : isOff(date, policy) ? 'off' : 'work';

/* ── The attendance report ───────────────────────────────────────────────── */

export interface ReportRow {
  person: Person;
  present: number;
  office: number;
  site: number;
  wfh: number;
  late: number;
  open: number;
  minutes: number;
  awayDays: number;
}
/** Each person in scope, for a month: days present by mode, late arrivals, hours and approved leave. */
export function monthReport(s: Snapshot, month: string): ReportRow[] {
  const scope = new Set(s.attendance.map((a) => a.employeeId).concat(s.requests.map((r) => r.employeeId), [s.me.id]));
  const people = [s.me, ...s.people.filter((p) => p.id !== s.me.id)].filter((p) => scope.has(p.id));
  return people.map((person) => {
    const mine = s.attendance.filter((a) => a.employeeId === person.id && a.date.slice(0, 7) === month);
    const leave = s.requests.filter((r) => r.employeeId === person.id && r.kind === 'leave' && r.type !== 'WFH' && (r.status === 'Approved' || r.status === 'Cancellation requested'));
    return {
      person,
      present: mine.length,
      office: mine.filter((a) => a.mode === 'Office').length,
      site: mine.filter((a) => a.mode === 'Site').length,
      wfh: mine.filter((a) => a.mode === 'WFH').length,
      late: mine.filter((a) => isLate(a, s.policy)).length,
      open: mine.filter((a) => !a.checkOut).length,
      minutes: mine.filter((a) => a.checkOut).reduce((n, a) => n + minutesWorked(a, a.checkOut!), 0),
      awayDays: leave.reduce((n, r) => n + r.days.filter((d) => d.date.slice(0, 7) === month).reduce((m, d) => m + d.units, 0), 0),
    };
  });
}

const cell = (v: unknown) => {
  const t = String(v ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** Every session in scope for a month, one row each, for a spreadsheet. */
export function attendanceCsv(s: Snapshot, month: string): string {
  const head = ['Date', 'Name', 'Mode', 'Site', 'Check-in', 'Check-out', 'Hours', 'Late', 'Where (check-in)', 'Distance from office (m)'];
  const rows = s.attendance
    .filter((a) => a.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || personName(s, a.employeeId).localeCompare(personName(s, b.employeeId)))
    .map((a) => [
      a.date, personName(s, a.employeeId), a.mode, a.site, timeLabel(a.checkIn, s.policy.timezone),
      a.checkOut ? timeLabel(a.checkOut, s.policy.timezone) : '', a.checkOut ? (minutesWorked(a, a.checkOut) / 60).toFixed(2) : '',
      isLate(a, s.policy) ? 'Yes' : 'No', whereLabel(a.checkInLocation, a.mode), a.checkInLocation?.distanceM ?? '',
    ]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

/** A command ID People accepts (lib/peopleDesk execute): 8–100 letters, digits, - or _. */
export function newCommandId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
