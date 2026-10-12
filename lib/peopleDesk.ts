/*
  PEOPLE: ATTENDANCE AND LEAVE.

  The rules of FFDS People Hub (ffdstoolsuniverse, apps/people-hub/shared/
  domain.ts), brought into StudioDesk unchanged where they can be: one
  attendance session a business day, timed by the server; full and half-day
  PL, SL, CL, COMP and WFH requests that reserve balance while pending and
  consume it once approved, charged to the financial year of each day;
  withdrawal, cancellation and reviewed corrections; nobody approves their
  own request; managers see their direct reports, Ops and admins the studio;
  everyone else sees availability only. Every command carries an ID, so a
  retry returns the first outcome instead of acting twice.

  Added for StudioDesk:
    - where a check-in or check-out happened, for Office and Site sessions
      (never for WFH), and how far it was from the office;
    - the studio's team and its People settings become the people list
      (peopleOf, policyOf), so there is no separate member table.

  Pure, so the tests and the Cloud Functions (functions/src/peopleDesk.ts)
  run the same code.
*/
export type Role = "employee" | "manager" | "ops" | "admin";
export type Mode = "Office" | "Site" | "WFH";
export type LeaveType = "PL" | "SL" | "CL" | "COMP" | "WFH";
export type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Withdrawn"
  | "Cancellation requested"
  | "Cancelled";
export type Portion = "Full day" | "First half" | "Second half";
export interface Person {
  id: string;
  name: string;
  title: string;
  teamId: string;
  managerId: string;
  accessRole: Role;
  active: boolean;
  email?: string;
  googleSub?: string;
  dailyUpdateUrl?: string;
  entitlements?: Record<string, Partial<Record<LeaveType, number>>>;
}
export interface Policy {
  version: string;
  timezone: string;
  start: string;
  lateAfter: string;
  end: string;
  weeklyOffDays: number[];
  /**
   * A day off on chosen weeks of each month, on top of the weekly offs:
   * People Hub's 2nd and 4th Sunday is {weekday: 0, weeks: [2, 4]}. Week n
   * is the nth such weekday of the month (days 7n-6 to 7n).
   */
  monthlyOff: { weekday: number; weeks: number[] };
  holidays: string[];
  fiscalStartMonth: number;
  allowances: Record<LeaveType, number>;
  /** Holiday names by date, for the calendar. */
  holidayNames?: Record<string, string>;
  /** Where the office is, to tell an office check-in from one elsewhere. */
  office: { lat: number; lng: number; radiusM: number } | null;
  /** Office and Site check-ins must share a location. */
  requireLocation: boolean;
}
export function dailyUpdateLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const link = value.trim();
  return link.length <= 2048 &&
    /^https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"\\]+$/i.test(link)
    ? link
    : undefined;
}
export const DEFAULT_POLICY: Policy = {
  version: "draft-2-allowances-confirmed-2026-10-08",
  timezone: "Asia/Kolkata",
  start: "10:30",
  lateAfter: "11:30",
  end: "18:30",
  weeklyOffDays: [1],
  monthlyOff: { weekday: 0, weeks: [2, 4] },
  holidays: [],
  fiscalStartMonth: 4,
  allowances: { PL: 12, SL: 6, CL: 6, COMP: 0, WFH: 0 },
  office: null,
  requireLocation: false,
};
/* Object.hasOwn, for the Cloud Functions' older compile target. */
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const LEAVE_LABELS: Record<LeaveType, string> = {
  PL: "Planned leave",
  SL: "Sick leave",
  CL: "Casual leave",
  COMP: "Comp-off",
  WFH: "Work from home",
};
export function validateConfiguration(people: Person[], policy: Policy) {
  assert(
    policy &&
      typeof policy.version === "string" &&
      policy.timezone === "Asia/Kolkata",
    "A valid India studio policy is required.",
    "CONFIG",
    503,
  );
  assert(
    [policy.start, policy.lateAfter, policy.end].every((t) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
    ),
    "Invalid policy working hours.",
    "CONFIG",
    503,
  );
  assert(
    Number.isInteger(policy.fiscalStartMonth) &&
      policy.fiscalStartMonth >= 1 &&
      policy.fiscalStartMonth <= 12,
    "Invalid fiscal start month.",
    "CONFIG",
    503,
  );
  assert(
    Array.isArray(policy.weeklyOffDays) &&
      policy.weeklyOffDays.every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 6,
      ) &&
      !!policy.monthlyOff &&
      Number.isInteger(policy.monthlyOff.weekday) &&
      policy.monthlyOff.weekday >= 0 &&
      policy.monthlyOff.weekday <= 6 &&
      Array.isArray(policy.monthlyOff.weeks) &&
      policy.monthlyOff.weeks.every((n) => Number.isInteger(n) && n >= 1 && n <= 5),
    "Invalid weekly offs.",
    "CONFIG",
    503,
  );
  assert(
    Array.isArray(policy.holidays) && policy.holidays.every(validDate),
    "Invalid holiday dates.",
    "CONFIG",
    503,
  );
  assert(
    policy.allowances &&
      Object.keys(LEAVE_LABELS).every(
        (t) =>
          Number.isFinite(policy.allowances[t as LeaveType]) &&
          policy.allowances[t as LeaveType] >= 0,
      ),
    "Invalid leave allowances.",
    "CONFIG",
    503,
  );
  assert(
    policy.office === null ||
      (validCoords(policy.office.lat, policy.office.lng) &&
        Number.isFinite(policy.office.radiusM) &&
        policy.office.radiusM >= 20 &&
        policy.office.radiusM <= 5000),
    "Invalid office location.",
    "CONFIG",
    503,
  );
  const ids = new Set<string>(),
    emails = new Set<string>(),
    subs = new Set<string>();
  for (const p of people) {
    assert(
      /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) && !ids.has(p.id),
      "People must have unique stable IDs.",
      "CONFIG",
      503,
    );
    ids.add(p.id);
    assert(
      ["employee", "manager", "ops", "admin"].includes(p.accessRole),
      "People must have explicit access roles.",
      "CONFIG",
      503,
    );
    if (p.email) {
      const email = p.email.trim().toLowerCase();
      assert(!emails.has(email), "Duplicate member email.", "CONFIG", 503);
      emails.add(email);
    }
    if (p.googleSub) {
      assert(
        !subs.has(p.googleSub),
        "Duplicate Google identity.",
        "CONFIG",
        503,
      );
      subs.add(p.googleSub);
    }
    for (const [year, balances] of Object.entries(p.entitlements || {})) {
      assert(
        /^\d{4}$/.test(year) &&
          Object.entries(balances).every(
            ([type, amount]) =>
              hasOwn(LEAVE_LABELS, type) &&
              typeof amount === "number" &&
              Number.isFinite(amount) &&
              amount >= 0,
          ),
        "Invalid personal entitlement.",
        "CONFIG",
        503,
      );
    }
  }
  for (const p of people)
    assert(
      !p.managerId || (ids.has(p.managerId) && p.managerId !== p.id),
      "An assigned manager must exist and be a different person.",
      "CONFIG",
      503,
    );
}
export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  mode: Mode;
  site: string;
  version: number;
  /** Where the person was, for Office and Site sessions. */
  checkInLocation?: Located | null;
  checkOutLocation?: Located | null;
  /** Brought over from People Hub (lib/peopleImport.ts). */
  imported?: Imported;
}
/** Where an imported record came from: the People Hub workbook row, and the import that wrote it. */
export interface Imported {
  from: "people-hub";
  batch: string;
  tab: string;
  row: number;
  /** What the import noticed, e.g. no check-out was recorded. */
  flags: string[];
}
export interface Located {
  lat: number;
  lng: number;
  accuracyM: number;
  /** Metres from the office, when the studio has set one. */
  distanceM: number | null;
  /** Within the office radius (allowing for the reading's accuracy), when there is an office. */
  atOffice: boolean | null;
}
export interface RequestRecord {
  id: string;
  employeeId: string;
  kind: "leave" | "correction";
  type: LeaveType;
  start: string;
  end: string;
  portion: Portion;
  days: { date: string; units: number }[];
  reason: string;
  status: Status;
  version: number;
  createdAt: string;
  decisions: { actorId: string; at: string; status: Status; note: string }[];
  correction?: {
    sessionId: string;
    sessionVersion: number;
    checkIn: string;
    checkOut: string;
    mode: Mode;
    site: string;
  };
  imported?: Imported;
}
export interface Event {
  id: string;
  commandId: string;
  actorId: string;
  at: string;
  action: string;
  fingerprint: string;
  session?: Attendance;
  request?: RequestRecord;
}
export interface State {
  attendance: Attendance[];
  requests: RequestRecord[];
  events: Event[];
}
export interface Store extends State {
  people: Person[];
  policy: Policy;
}
export interface Availability {
  requestId: string;
  employeeId: string;
  start: string;
  end: string;
  portion: Portion;
  status: Status;
  mode: "Away" | "WFH";
}
export interface HistoricalRecord {
  id: string;
  employeeId: string;
  category: string;
  sourceRow: number;
  date: string;
  summary: string;
  flags: string[];
  fields: { label: string; value: string }[];
}
export interface Snapshot {
  history?: HistoricalRecord[];
  me: Person;
  people: Person[];
  policy: Policy;
  attendance: Attendance[];
  requests: RequestRecord[];
  availability: Availability[];
  balances: Record<string, Record<LeaveType, Balance>>;
  serverTime: string;
  revision: number;
}
export interface Balance {
  entitled: number;
  used: number;
  reserved: number;
  remaining: number;
  available: number;
}
export interface Command {
  id: string;
  action:
    | "checkin"
    | "checkout"
    | "request"
    | "correction"
    | "decide"
    | "withdraw"
    | "cancel";
  data: Record<string, unknown>;
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function assert(
  value: unknown,
  message: string,
  code = "INVALID",
  status = 400,
): asserts value {
  if (!value) throw new DomainError(code, message, status);
}
export function businessDate(
  instant: string | Date,
  timezone = DEFAULT_POLICY.timezone,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function timeLabel(
  instant?: string,
  timezone = DEFAULT_POLICY.timezone,
): string {
  return instant
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(instant))
    : "—";
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function fiscalYear(date: string, policy: Policy): string {
  const year = Number(date.slice(0, 4));
  return String(
    Number(date.slice(5, 7)) >= policy.fiscalStartMonth ? year : year - 1,
  );
}
/** Which of its weekday this date is in its month: 1 for days 1–7, 5 for 29–31. */
export const weekOfMonth = (date: string): number => Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2nd and 4th Sunday", or "" when there is no monthly off. */
export function monthlyOffLabel(policy: Pick<Policy, "monthlyOff">): string {
  const weeks = [...(policy.monthlyOff?.weeks || [])].sort();
  if (!weeks.length) return "";
  const list = weeks.map((w) => ORDINAL[w]);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${joined} ${WEEKDAY[policy.monthlyOff.weekday]}`;
}
export function isOff(date: string, policy: Policy): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  return (
    policy.holidays.includes(date) ||
    policy.weeklyOffDays.includes(day) ||
    (day === policy.monthlyOff.weekday &&
      policy.monthlyOff.weeks.includes(weekOfMonth(date)))
  );
}
export function leaveDays(
  start: string,
  end: string,
  portion: Portion,
  policy: Policy,
) {
  assert(validDate(start) && validDate(end), "Choose valid dates.");
  assert(end >= start, "End date must be on or after the start date.");
  assert(
    ["Full day", "First half", "Second half"].includes(portion),
    "Choose a valid day portion.",
  );
  assert(
    portion === "Full day" || start === end,
    "A half day must use a single date.",
  );
  assert(
    (Date.parse(end) - Date.parse(start)) / 86400000 <= 60,
    "Request up to 61 calendar days at a time.",
  );
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1))
    if (!isOff(d, policy))
      days.push({ date: d, units: portion === "Full day" ? 1 : 0.5 });
  assert(
    days.length,
    "Choose at least one working day. Holidays and weekly offs are excluded.",
  );
  return days;
}
export function canReview(actor: Person, employee: Person): boolean {
  if (actor.id === employee.id || !actor.active) return false;
  return (
    actor.accessRole === "ops" ||
    actor.accessRole === "admin" ||
    (actor.accessRole === "manager" && employee.managerId === actor.id)
  );
}
export function isApprover(person: Person): boolean {
  return person.accessRole !== "employee";
}
const reserves = (status: Status) => status === "Pending";
const consumes = (status: Status) =>
  status === "Approved" || status === "Cancellation requested";
export function balanceFor(
  store: Store,
  person: Person,
  type: LeaveType,
  fy: string,
): Balance {
  const entitled =
    person.entitlements?.[fy]?.[type] ?? store.policy.allowances[type];
  let used = 0,
    reserved = 0;
  for (const r of store.requests.filter(
    (r) => r.employeeId === person.id && r.kind === "leave" && r.type === type,
  )) {
    const units = r.days
      .filter((d) => fiscalYear(d.date, store.policy) === fy)
      .reduce((sum, d) => sum + d.units, 0);
    if (consumes(r.status)) used += units;
    if (reserves(r.status)) reserved += units;
  }
  return {
    entitled,
    used,
    reserved,
    remaining: entitled - used,
    available: entitled - used - reserved,
  };
}
export function scopeSnapshot(
  store: Store,
  actorId: string,
  now: string,
): Snapshot {
  const actor = store.people.find((p) => p.id === actorId && p.active);
  assert(actor, "Your account is not active in People Hub.", "FORBIDDEN", 403);
  const publicPerson = (p: Person): Person => ({
    id: p.id,
    name: p.name,
    title: p.title,
    teamId: p.teamId,
    managerId: p.managerId,
    accessRole: p.id === actor.id ? p.accessRole : "employee",
    active: p.active,
  });
  const allowed = new Set(
    store.people
      .filter((p) => p.id === actor.id || canReview(actor, p))
      .map((p) => p.id),
  );
  const balances: Snapshot["balances"] = {};
  const today = businessDate(now, store.policy.timezone);
  const fy = Number(fiscalYear(today, store.policy));
  for (const year of [fy - 1, fy, fy + 1]) {
    balances[year] = Object.fromEntries(
      (Object.keys(LEAVE_LABELS) as LeaveType[]).map((type) => [
        type,
        balanceFor(store, actor, type, String(year)),
      ]),
    ) as Record<LeaveType, Balance>;
  }
  return {
    me: {
      ...publicPerson(actor),
      dailyUpdateUrl: dailyUpdateLink(actor.dailyUpdateUrl),
    },
    people: store.people
      .filter((p) => p.active || allowed.has(p.id))
      .map(publicPerson),
    policy: store.policy,
    attendance: store.attendance.filter((a) => allowed.has(a.employeeId)),
    requests: store.requests.filter((r) => allowed.has(r.employeeId)),
    availability: store.requests
      .filter(
        (r) => r.kind === "leave" && (reserves(r.status) || consumes(r.status)),
      )
      .map((r) => ({
        requestId: r.id,
        employeeId: r.employeeId,
        start: r.start,
        end: r.end,
        portion: r.portion,
        status: r.status,
        mode: r.type === "WFH" ? "WFH" : "Away",
      })),
    balances,
    serverTime: now,
    revision: store.events.length,
  };
}
export function project(events: Event[]): State {
  const sessions = new Map<string, Attendance>(),
    requests = new Map<string, RequestRecord>();
  for (const event of events) {
    if (event.session) sessions.set(event.session.id, event.session);
    if (event.request) requests.set(event.request.id, event.request);
  }
  return {
    attendance: [...sessions.values()],
    requests: [...requests.values()],
    events,
  };
}
function text(value: unknown, label: string, max = 1000): string {
  assert(
    typeof value === "string" && value.length <= max,
    `${label} is invalid.`,
  );
  return value.trim();
}
function mode(value: unknown): Mode {
  assert(
    ["Office", "Site", "WFH"].includes(String(value)),
    "Choose Office, Site, or WFH.",
  );
  return value as Mode;
}
const validCoords = (lat: unknown, lng: unknown) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
/** Metres between two points (haversine). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const r = 6371000,
    rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}
/**
 * The location a check-in or check-out reports, measured against the office.
 * Reported by the person's browser, so it is evidence, not proof. WFH never
 * records a location.
 */
function located(value: unknown, sessionMode: Mode, policy: Policy): Located | null {
  if (sessionMode === "WFH") return null;
  const v = value as { lat?: unknown; lng?: unknown; accuracyM?: unknown } | null;
  if (v == null) {
    assert(
      !policy.requireLocation,
      "Allow location to check in from the office or a site.",
      "LOCATION",
      400,
    );
    return null;
  }
  assert(validCoords(v.lat, v.lng), "The location reading is invalid.");
  const accuracyM = Number(v.accuracyM);
  assert(
    Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= 100000,
    "The location reading is invalid.",
  );
  const here = { lat: v.lat as number, lng: v.lng as number };
  const d = policy.office ? distanceM(here, policy.office) : null;
  return {
    lat: Math.round(here.lat * 1e6) / 1e6,
    lng: Math.round(here.lng * 1e6) / 1e6,
    accuracyM: Math.round(accuracyM),
    distanceM: d,
    atOffice:
      policy.office && d != null
        ? d <= policy.office.radiusM + Math.min(accuracyM, 150)
        : null,
  };
}
/** Checked in after the late cutoff, in the studio's time. */
export function isLate(session: Pick<Attendance, "checkIn">, policy: Policy): boolean {
  return timeLabel(session.checkIn, policy.timezone) > policy.lateAfter;
}
function overlapping(a: RequestRecord, b: RequestRecord): boolean {
  return (
    a.days.some((d) => b.days.some((other) => other.date === d.date)) &&
    (a.portion === "Full day" ||
      b.portion === "Full day" ||
      a.portion === b.portion)
  );
}
function checkLeave(store: Store, person: Person, req: RequestRecord) {
  assert(
    !store.requests.some(
      (r) =>
        r.id !== req.id &&
        r.employeeId === person.id &&
        r.kind === "leave" &&
        (reserves(r.status) || consumes(r.status)) &&
        overlapping(r, req),
    ),
    "These dates overlap an active request.",
    "OVERLAP",
    409,
  );
  if (req.type === "WFH") return;
  const withoutThis = {
    ...store,
    requests: store.requests.filter((r) => r.id !== req.id),
  };
  for (const fy of new Set(
    req.days.map((d) => fiscalYear(d.date, store.policy)),
  )) {
    const units = req.days
      .filter((d) => fiscalYear(d.date, store.policy) === fy)
      .reduce((sum, d) => sum + d.units, 0);
    assert(
      balanceFor(withoutThis, person, req.type, fy).available >= units,
      `Insufficient ${LEAVE_LABELS[req.type]} balance for FY ${fy}.`,
      "BALANCE",
      409,
    );
  }
}
export function fingerprint(command: Command): string {
  const ordered = Object.fromEntries(
    Object.entries(command.data).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({ action: command.action, data: ordered });
}
export function execute(
  store: Store,
  actorId: string,
  command: Command,
  now: string,
): Event {
  const actor = store.people.find((p) => p.id === actorId && p.active);
  assert(actor, "Your account is not active.", "FORBIDDEN", 403);
  assert(
    command && /^[a-zA-Z0-9_-]{8,100}$/.test(command.id),
    "A valid request ID is required.",
  );
  assert(
    command.data &&
      typeof command.data === "object" &&
      !Array.isArray(command.data),
    "Request data is invalid.",
  );
  const print = fingerprint(command);
  const retry = store.events.find(
    (e) => e.commandId === command.id && e.actorId === actor.id,
  );
  if (retry) {
    assert(
      retry.fingerprint === print,
      "This request ID was already used for a different action.",
      "CONFLICT",
      409,
    );
    return retry;
  }
  const scopedId = `${actor.id.length}_${actor.id}_${command.id}`;
  const event: Event = {
    id: `ev_${scopedId}`,
    commandId: command.id,
    actorId,
    at: now,
    action: command.action,
    fingerprint: print,
  };
  const data = command.data;
  const today = businessDate(now, store.policy.timezone);
  /* An imported day with no check-out is history, not a session left open. */
  const open = store.attendance.find(
    (s) => s.employeeId === actor.id && !s.checkOut && !s.imported,
  );
  if (command.action === "checkin") {
    assert(
      !open,
      "You have an open attendance session. Check out or request a correction.",
      "CONFLICT",
      409,
    );
    assert(
      !store.attendance.some(
        (s) => s.employeeId === actor.id && s.date === today,
      ),
      "You already have attendance for today.",
      "CONFLICT",
      409,
    );
    const sessionMode = mode(data.mode);
    event.session = {
      id: `at_${scopedId}`,
      employeeId: actor.id,
      date: today,
      checkIn: now,
      mode: sessionMode,
      site: text(data.site ?? "", "Site", 120),
      version: 1,
      checkInLocation: located(data.location, sessionMode, store.policy),
    };
  } else if (command.action === "checkout") {
    assert(open, "No open session to check out.", "CONFLICT", 409);
    assert(
      data.sessionId === open.id && data.version === open.version,
      "Attendance changed. Refresh and try again.",
      "CONFLICT",
      409,
    );
    assert(
      Date.parse(now) > Date.parse(open.checkIn),
      "Check-out must be after check-in.",
    );
    assert(
      Date.parse(now) - Date.parse(open.checkIn) <= 24 * 3600000,
      "This session is over 24 hours old. Request a correction.",
    );
    event.session = {
      ...open,
      checkOut: now,
      version: open.version + 1,
      checkOutLocation: located(data.location, open.mode, {
        ...store.policy,
        requireLocation: false,
      }),
    };
  } else if (command.action === "request") {
    const type = text(data.type, "Leave type") as LeaveType;
    assert(hasOwn(LEAVE_LABELS, type), "Unknown leave type.");
    const start = text(data.start, "Start"),
      end = text(data.end, "End");
    const portion = text(data.portion, "Portion") as Portion;
    const request: RequestRecord = {
      id: `rq_${scopedId}`,
      employeeId: actor.id,
      kind: "leave",
      type,
      start,
      end,
      portion,
      days: leaveDays(start, end, portion, store.policy),
      reason: text(data.reason ?? "", "Note"),
      status: "Pending",
      version: 1,
      createdAt: now,
      decisions: [],
    };
    assert(
      store.people.some((p) => p.active && canReview(p, actor)),
      "No approver is assigned to your account. Contact People Ops.",
      "NO_APPROVER",
      409,
    );
    checkLeave(store, actor, request);
    event.request = request;
  } else if (command.action === "correction") {
    const session = store.attendance.find(
      (s) => s.id === data.sessionId && s.employeeId === actor.id,
    );
    assert(session, "Attendance record not found.", "NOT_FOUND", 404);
    assert(
      data.version === session.version,
      "Attendance changed. Refresh before requesting a correction.",
      "CONFLICT",
      409,
    );
    assert(
      !store.requests.some(
        (r) =>
          r.kind === "correction" &&
          r.correction?.sessionId === session.id &&
          r.status === "Pending",
      ),
      "A correction is already pending for this session.",
      "CONFLICT",
      409,
    );
    const checkIn = text(data.checkIn, "Check-in"),
      checkOut = text(data.checkOut, "Check-out");
    assert(
      Number.isFinite(Date.parse(checkIn)) &&
        Number.isFinite(Date.parse(checkOut)),
      "Enter valid timestamps.",
    );
    assert(
      businessDate(checkIn, store.policy.timezone) === session.date,
      "Check-in must be on the original business date.",
    );
    assert(
      Date.parse(checkOut) > Date.parse(checkIn) &&
        Date.parse(checkOut) - Date.parse(checkIn) <= 24 * 3600000,
      "Corrected attendance must be between 0 and 24 hours.",
    );
    assert(
      Date.parse(checkOut) <= Date.parse(now),
      "A correction cannot record future attendance.",
    );
    const reason = text(data.reason, "Reason");
    assert(reason.length >= 3, "Add a reason for the correction.");
    assert(
      store.people.some((p) => p.active && canReview(p, actor)),
      "No approver is assigned.",
      "NO_APPROVER",
      409,
    );
    event.request = {
      id: `rq_${scopedId}`,
      employeeId: actor.id,
      kind: "correction",
      type: "PL",
      start: session.date,
      end: session.date,
      portion: "Full day",
      days: [],
      reason,
      status: "Pending",
      version: 1,
      createdAt: now,
      decisions: [],
      correction: {
        sessionId: session.id,
        sessionVersion: session.version,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
        mode: mode(data.mode),
        site: text(data.site ?? "", "Site", 120),
      },
    };
  } else if (["decide", "withdraw", "cancel"].includes(command.action)) {
    const original = store.requests.find((r) => r.id === data.requestId);
    assert(original, "Request not found.", "NOT_FOUND", 404);
    assert(
      data.version === original.version,
      "Someone already changed this request. Refresh to see the latest decision.",
      "CONFLICT",
      409,
    );
    const employee = store.people.find((p) => p.id === original.employeeId)!;
    const req = JSON.parse(JSON.stringify(original)) as RequestRecord;
    const note = text(data.note ?? "", "Decision note");
    if (command.action === "withdraw") {
      assert(
        original.employeeId === actor.id,
        "You may only withdraw your own request.",
        "FORBIDDEN",
        403,
      );
      assert(
        original.status === "Pending",
        "Only pending requests can be withdrawn.",
        "CONFLICT",
        409,
      );
      req.status = "Withdrawn";
    } else if (command.action === "cancel") {
      assert(
        original.employeeId === actor.id,
        "You may only cancel your own request.",
        "FORBIDDEN",
        403,
      );
      assert(
        original.kind === "leave" && original.status === "Approved",
        "Only approved leave or WFH can be cancelled.",
        "CONFLICT",
        409,
      );
      req.status = "Cancellation requested";
    } else {
      assert(
        canReview(actor, employee),
        "You cannot decide this request or approve your own request.",
        "FORBIDDEN",
        403,
      );
      assert(
        ["Pending", "Cancellation requested"].includes(original.status),
        "This request has already been decided.",
        "CONFLICT",
        409,
      );
      assert(
        data.decision === "approve" || data.decision === "reject",
        "Choose approve or reject.",
      );
      if (data.decision === "reject")
        assert(note.length >= 3, "Add a short reason for the rejection.");
      if (original.status === "Cancellation requested")
        req.status = data.decision === "approve" ? "Cancelled" : "Approved";
      else {
        req.status = data.decision === "approve" ? "Approved" : "Rejected";
        if (req.status === "Approved" && req.kind === "leave")
          checkLeave(store, employee, req);
        if (req.status === "Approved" && req.correction) {
          const session = store.attendance.find(
            (s) => s.id === req.correction!.sessionId,
          );
          assert(
            session && session.version === req.correction.sessionVersion,
            "Attendance changed since this correction was submitted. Ask for a new correction.",
            "CONFLICT",
            409,
          );
          event.session = {
            ...session,
            checkIn: req.correction.checkIn,
            checkOut: req.correction.checkOut,
            mode: req.correction.mode,
            site: req.correction.site,
            version: session.version + 1,
          };
        }
      }
    }
    req.version++;
    req.decisions.push({
      actorId: actor.id,
      at: now,
      status: req.status,
      note,
    });
    event.request = req;
  } else throw new DomainError("INVALID", "Unknown action.");
  return event;
}
export function applyEvent(store: Store, event: Event): Store {
  if (
    store.events.some((e) => e.id === event.id && e.actorId === event.actorId)
  )
    return store;
  return { ...store, ...project([...store.events, event]) };
}
export function smartPreview(
  snapshot: Snapshot,
  start: string,
  end: string,
  portion: Portion = "Full day",
) {
  const days = leaveDays(start, end, portion, snapshot.policy);
  let first = start,
    last = end;
  for (let i = 0; i < 7 && isOff(addDays(first, -1), snapshot.policy); i++)
    first = addDays(first, -1);
  for (let i = 0; i < 7 && isOff(addDays(last, 1), snapshot.policy); i++)
    last = addDays(last, 1);
  const conflicts = snapshot.availability.filter(
    (r) => r.start <= end && r.end >= start && r.mode === "Away",
  );
  const byYear = Object.fromEntries(
    [...new Set(days.map((d) => fiscalYear(d.date, snapshot.policy)))].map(
      (fy) => [
        fy,
        days
          .filter((d) => fiscalYear(d.date, snapshot.policy) === fy)
          .reduce((n, d) => n + d.units, 0),
      ],
    ),
  );
  return {
    days,
    byYear,
    units: days.reduce((sum, d) => sum + d.units, 0),
    breakStart: first,
    breakEnd: last,
    breakDays: (Date.parse(last) - Date.parse(first)) / 86400000 + 1,
    conflicts,
  };
}

/* ── The studio's team as People (StudioDesk) ────────────────────────────── */

/** What Studio settings → People keeps for each team member, keyed by their team ID. */
export interface MemberSettings {
  /** Team ID of the person they report to. */
  managerId?: string;
  /** Left out of attendance and leave, e.g. a consultant. */
  excluded?: boolean;
  /** Per-year overrides of the studio's allowances, e.g. {"2026":{"PL":15}}. */
  entitlements?: Record<string, Partial<Record<LeaveType, number>>>;
  dailyUpdateUrl?: string;
}
export interface PeopleSettings {
  policy?: Partial<Policy>;
  members?: Record<string, MemberSettings>;
}

/** Roles that run People: they see everyone and decide every request but their own. */
export const PEOPLE_ADMIN_ROLES = ["Super Admin", "Owner", "Admin"];
export const PEOPLE_OPS_ROLES = ["Ops Director"];
/** Not studio staff: never on attendance. */
const OUTSIDERS = new Set(["Client", "Vendor"]);

const rolesOf = (m: any): string[] =>
  [m?.role, ...(Array.isArray(m?.roles) ? m.roles : [])].map((r) => String(r || ""));
const teamOf = (roles: string[]): string =>
  roles.includes("Owner") || roles.includes("Admin")
    ? "leadership"
    : roles.includes("Design Head") || roles.includes("Designer")
      ? "design"
      : roles.includes("Site Supervisor")
        ? "site"
        : roles.includes("Client Relations")
          ? "client-relations"
          : roles.includes("Ops Director")
            ? "ops"
            : "studio";

/* The monthly off as saved, or from the older 2nd-and-4th-Sunday switch. */
function monthlyOffOf(p: any): Policy["monthlyOff"] {
  const m = p.monthlyOff;
  if (m && Number.isInteger(Number(m.weekday)) && Number(m.weekday) >= 0 && Number(m.weekday) <= 6 && Array.isArray(m.weeks))
    return {
      weekday: Number(m.weekday),
      weeks: [...new Set(m.weeks.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 5))].sort() as number[],
    };
  if (p.alternateSundays === false) return { weekday: 0, weeks: [] };
  return { weekday: DEFAULT_POLICY.monthlyOff.weekday, weeks: [...DEFAULT_POLICY.monthlyOff.weeks] };
}

/** The studio's People settings, with anything missing or malformed taken from the defaults. */
export function policyOf(org: any): Policy {
  const p: any = org?.peopleDesk?.policy || {};
  const time = (v: unknown, d: string) =>
    typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d;
  const holidays = (Array.isArray(p.holidays) ? p.holidays : [])
    .map(String)
    .filter(validDate);
  const names: Record<string, string> = {};
  for (const [d, n] of Object.entries(p.holidayNames || {}))
    if (validDate(d) && typeof n === "string") names[d] = n.trim().slice(0, 80);
  const allowances = { ...DEFAULT_POLICY.allowances };
  for (const t of Object.keys(LEAVE_LABELS) as LeaveType[]) {
    const n = Number(p.allowances?.[t]);
    if (Number.isFinite(n) && n >= 0 && n <= 365) allowances[t] = n;
  }
  const o = p.office;
  const office =
    o && validCoords(o.lat, o.lng) && Number(o.radiusM) >= 20 && Number(o.radiusM) <= 5000
      ? { lat: Number(o.lat), lng: Number(o.lng), radiusM: Math.round(Number(o.radiusM)) }
      : null;
  const month = Number(p.fiscalStartMonth);
  return {
    version: typeof p.version === "string" && p.version ? p.version.slice(0, 80) : DEFAULT_POLICY.version,
    timezone: "Asia/Kolkata",
    start: time(p.start, DEFAULT_POLICY.start),
    lateAfter: time(p.lateAfter, DEFAULT_POLICY.lateAfter),
    end: time(p.end, DEFAULT_POLICY.end),
    weeklyOffDays: Array.isArray(p.weeklyOffDays)
      ? [...new Set(p.weeklyOffDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))] as number[]
      : [...DEFAULT_POLICY.weeklyOffDays],
    monthlyOff: monthlyOffOf(p),
    holidays: [...new Set(holidays)].sort() as string[],
    holidayNames: names,
    fiscalStartMonth: Number.isInteger(month) && month >= 1 && month <= 12 ? month : DEFAULT_POLICY.fiscalStartMonth,
    allowances,
    office,
    /* The owner asked for check-in locations (11 Oct 2026): on unless the studio turns it off. */
    requireLocation: typeof p.requireLocation === "boolean" ? p.requireLocation : true,
  };
}

/**
 * Everyone on the studio's team who works there (not clients or vendors),
 * as People. Their access follows their StudioDesk roles: Owner and Admin
 * run People, an Ops Director reviews like Ops, anyone with someone
 * reporting to them is a manager, everyone else an employee.
 */
export function peopleOf(org: any): Person[] {
  const settings: Record<string, MemberSettings> = org?.peopleDesk?.members || {};
  const team: any[] = (Array.isArray(org?.team) ? org.team : []).filter(
    (m) => m?.id && m?.email && !rolesOf(m).some((r) => OUTSIDERS.has(r)) && /^[a-zA-Z0-9_-]{1,80}$/.test(String(m.id)),
  );
  const ids = new Set(team.map((m) => String(m.id)));
  const managerOf = (id: string) => {
    const mgr = String(settings[id]?.managerId || "");
    return mgr && mgr !== id && ids.has(mgr) && !settings[mgr]?.excluded ? mgr : "";
  };
  const managers = new Set(team.map((m) => managerOf(String(m.id))).filter(Boolean));
  return team.map((m) => {
    const id = String(m.id);
    const roles = rolesOf(m);
    const s = settings[id] || {};
    const accessRole: Role = roles.some((r) => PEOPLE_ADMIN_ROLES.includes(r))
      ? "admin"
      : roles.some((r) => PEOPLE_OPS_ROLES.includes(r))
        ? "ops"
        : managers.has(id)
          ? "manager"
          : "employee";
    const entitlements: Person["entitlements"] = {};
    for (const [year, byType] of Object.entries(s.entitlements || {})) {
      if (!/^\d{4}$/.test(year)) continue;
      const clean: Partial<Record<LeaveType, number>> = {};
      for (const [t, n] of Object.entries(byType || {}))
        if (hasOwn(LEAVE_LABELS, t) && Number.isFinite(Number(n)) && Number(n) >= 0) clean[t as LeaveType] = Number(n);
      entitlements[year] = clean;
    }
    return {
      id,
      name: String(m.name || String(m.email).split("@")[0]).slice(0, 80),
      title: String(m.title || m.role || "").slice(0, 80),
      teamId: teamOf(roles),
      managerId: managerOf(id),
      accessRole,
      active: !s.excluded,
      email: String(m.email).trim().toLowerCase(),
      dailyUpdateUrl: dailyUpdateLink(s.dailyUpdateUrl),
      entitlements,
    };
  });
}

/** The person signed in, by their verified email. */
export const personByEmail = (people: Person[], email: string): Person | undefined =>
  people.find((p) => p.email === String(email || "").trim().toLowerCase());
