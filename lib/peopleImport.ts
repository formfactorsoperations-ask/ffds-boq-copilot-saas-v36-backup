/*
  PEOPLE HUB → STUDIODESK: the import, worked out before anything is saved.

  An admin downloads the People Hub workbook (File → Download → Excel) and
  opens it in Studio settings → People. This file reads its tabs and plans
  the import as a dry run: who each person is on the studio's team, the
  attendance and leave to bring over, the holidays and comp-off to add to
  the settings, what does not add up against People Hub's own Balances tab,
  and the questions only the admin can answer. Nothing is written here; the
  Cloud Function (functions/src/peopleImport.ts) checks every record again
  with `checkImported` before it saves one.

  The rules come from People Hub's own migration notes (ffdstoolsuniverse,
  apps/people-hub/MIGRATION.md):
    - people are matched by email; leave rows, which only carry a name, by
      that exact name on the Team tab or the studio's team, never a guess;
    - a half day does not say which half: the admin chooses;
    - two attendance rows for one person and day: the admin keeps one;
    - a day with no check-out is kept as history, never as an open session,
      and no time is made up for it;
    - history is not charged twice: approved leave is brought over as leave,
      and People Hub's Balances tab is only compared with it, never applied.

  Records get IDs from their content (person and day, or People Hub's
  request ID), so importing the same workbook again updates rather than
  duplicates, and an import can be undone.
*/
import {
  LEAVE_LABELS, businessDate, fiscalYear, leaveDays, timeLabel, validDate,
  type Attendance, type Imported, type LeaveType, type Mode, type Person, type Policy, type Portion, type RequestRecord, type Status,
} from './peopleDesk';

export type Cell = string | number | boolean | Date | null | undefined;
/** Each tab of the workbook as rows of cells, the header row first. */
export type Workbook = Record<string, Cell[][]>;

export interface ImportChoices {
  /** For each person and day with two attendance rows, the row kept ("personId:date" → row). */
  keepRow?: Record<string, number>;
  /** Which half, for each half-day leave row. */
  halfOf?: Record<number, 'First half' | 'Second half'>;
  /** Who a leave row's name is, when the workbook does not say ("" leaves those rows out). */
  nameTo?: Record<string, string>;
}

export interface PersonMatch {
  row: number;
  name: string;
  email: string;
  active: boolean;
  isAdmin: boolean;
  personId: string | null;
  attendanceRows: number;
}
export interface Question {
  /** What the admin must decide; `id` keys the answer in ImportChoices. */
  kind: 'duplicate' | 'half' | 'name';
  id: string;
  title: string;
  detail: string;
  options: { value: string; label: string }[];
  /** Chosen already (by the admin, or a safe default). */
  answer: string | null;
  /** Must be answered before the import can be saved. */
  blocking: boolean;
}
export interface Skipped { tab: string; row: number; why: string }
export interface Recon {
  personId: string;
  name: string;
  fy: string;
  type: LeaveType;
  /** From People Hub's Balances tab. */
  hubEntitled: number | null;
  hubUsed: number | null;
  /** What StudioDesk will count from the imported leave. */
  used: number;
  /** What StudioDesk allows for that year. */
  entitled: number;
  agrees: boolean;
}
export interface CompGrant { personId: string; name: string; fy: string; earned: number; current: number | null }
export interface SettingCompare { label: string; hub: string; studio: string; same: boolean }

export interface ImportPlan {
  people: PersonMatch[];
  /** StudioDesk people the workbook does not mention. */
  notInHub: Person[];
  attendance: Attendance[];
  requests: RequestRecord[];
  holidays: { date: string; name: string }[];
  compGrants: CompGrant[];
  questions: Question[];
  skipped: Skipped[];
  recon: Recon[];
  settings: SettingCompare[];
  counts: {
    attendanceRows: number;
    leaveRows: number;
    noCheckout: number;
    duplicates: number;
    halfDays: number;
    byStatus: Partial<Record<Status, number>>;
  };
  /** Questions still to answer before saving. */
  blocking: number;
  /** Tabs the workbook is missing, or that are not laid out as People Hub's. */
  problems: string[];
}

/* ── Reading cells ───────────────────────────────────────────────────────── */

const IST_OFFSET = 330;
const norm = (v: Cell) => String(v ?? '').trim();
const key = (v: Cell) => norm(v).toLowerCase().replace(/\s+/g, ' ');
const yes = (v: Cell) => v === true || /^(y|yes|true|1)$/i.test(norm(v));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A spreadsheet date: an Excel day number, a JS date, 2026-10-09, 09/10/2026 (day first, as in India) or 9-Oct-2026. */
export function dateOf(v: Cell): string | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? businessDate(v) : null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const t = norm(v);
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:$|\s)/);
  if (m) return ok(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = t.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}
function ok(y: number, mo: number, d: number): string | null {
  const s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return validDate(s) ? s : null;
}

/** Seconds into the day of a time cell: a fraction of a day, 10:42, 10:42:15, 6:30 PM, or a date and time. */
export function secondsOf(v: Cell): number | null {
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    const t = timeLabel(v.toISOString());
    return Number(t.slice(0, 2)) * 3600 + Number(t.slice(3, 5)) * 60 + v.getUTCSeconds();
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    const frac = v - Math.floor(v);
    if (v >= 1 && frac === 0) return null;
    return Math.round(frac * 86400) % 86400;
  }
  const t = norm(v);
  if (!t) return null;
  /* A full timestamp with a zone: its time in India. */
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(t) && Number.isFinite(Date.parse(t))) return secondsOf(new Date(t));
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]), sec = Number(m[3] || 0);
  if (m[4]) {
    const pm = /p/i.test(m[4]);
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec;
}

/** The instant of a time on a studio day (India), as ISO. */
export const instantOf = (date: string, seconds: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + (seconds - IST_OFFSET * 60) * 1000).toISOString();

/** A whole timestamp cell (People Hub's CreatedAt and ApprovedAt), as ISO. */
function stampOf(v: Cell): string | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))) return new Date(v).toISOString();
  const d = dateOf(v);
  if (!d) return null;
  return instantOf(d, secondsOf(v) ?? 10 * 3600);
}

function modeOf(v: Cell): Mode | null {
  const t = key(v);
  if (!t || t === 'office' || t === 'studio') return 'Office';
  if (t === 'site' || t.includes('site')) return 'Site';
  if (t === 'wfh' || t.includes('home')) return 'WFH';
  return null;
}
function leaveTypeOf(v: Cell): LeaveType | null {
  const t = key(v).replace(/[\s_-]+/g, '');
  if (['pl', 'planned', 'plannedleave', 'privilege', 'privilegeleave', 'earned', 'el'].includes(t)) return 'PL';
  if (['sl', 'sick', 'sickleave'].includes(t)) return 'SL';
  if (['cl', 'casual', 'casualleave'].includes(t)) return 'CL';
  if (['comp', 'compoff', 'compensatory', 'compensatoryoff'].includes(t)) return 'COMP';
  if (['wfh', 'workfromhome', 'home'].includes(t)) return 'WFH';
  return null;
}
function statusOf(v: Cell): Status | null {
  const t = key(v);
  if (t === 'pending' || t === 'requested') return 'Pending';
  if (t === 'approved') return 'Approved';
  if (t === 'rejected' || t === 'declined') return 'Rejected';
  if (t === 'cancelled' || t === 'canceled') return 'Cancelled';
  if (t === 'withdrawn') return 'Withdrawn';
  return null;
}
const hoursOf = (v: Cell): string | null => {
  const t = norm(v);
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const s = secondsOf(v);
  return s == null ? null : `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};

/* ── Tabs ────────────────────────────────────────────────────────────────── */

/** The tab by name, ignoring case and spaces. */
function tab(book: Workbook, name: string): Cell[][] | null {
  const want = name.toLowerCase();
  const found = Object.keys(book).find((k) => k.trim().toLowerCase() === want);
  return found ? book[found] : null;
}
/** Column positions by header (ignoring case, spaces and underscores), or null when one is missing. */
function columns<K extends string>(rows: Cell[][], wanted: Record<K, string[]>): Record<K, number> | null {
  const head = (rows[0] || []).map((h) => key(h).replace(/[\s_()/-]+/g, ''));
  const out = {} as Record<K, number>;
  for (const [k, names] of Object.entries(wanted) as [K, string[]][]) {
    const i = head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    if (i < 0) return null;
    out[k] = i;
  }
  return out;
}
const body = (rows: Cell[][]) => rows.slice(1).map((r, i) => ({ r, row: i + 2 })).filter(({ r }) => r.some((c) => norm(c) !== ''));

/** An ID from content: letters, digits, - and _ only. */
const idPart = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
export const IMPORT_PREFIX = 'ph_';

/* ── The plan ────────────────────────────────────────────────────────────── */

export function planImport(book: Workbook, people: Person[], policy: Policy, choices: ImportChoices = {}, batch = 'dry-run'): ImportPlan {
  const problems: string[] = [];
  const skipped: Skipped[] = [];
  const questions: Question[] = [];
  const byEmail = new Map(people.filter((p) => p.email).map((p) => [p.email!.trim().toLowerCase(), p]));
  const studioByName = new Map<string, Person[]>();
  for (const p of people) studioByName.set(key(p.name), [...(studioByName.get(key(p.name)) || []), p]);
  const provenance = (t: string, row: number, flags: string[] = []): Imported => ({ from: 'people-hub', batch, tab: t, row, flags });

  /* Team: who is who. */
  const teamRows = tab(book, 'Team');
  const team: PersonMatch[] = [];
  const hubName = new Map<string, Set<string>>();
  if (!teamRows) problems.push('There is no Team tab, so leave can only be matched by the names on your studio team.');
  else {
    const c = columns(teamRows, { name: ['name'], email: ['email'], active: ['active'], admin: ['isadmin', 'admin'] });
    if (!c) problems.push('The Team tab needs Name, Email, Active and isAdmin columns.');
    else for (const { r, row } of body(teamRows)) {
      const email = norm(r[c.email]).toLowerCase();
      const person = byEmail.get(email) || null;
      team.push({ row, name: norm(r[c.name]), email, active: !/^(n|no|false|0)$/i.test(norm(r[c.active])), isAdmin: yes(r[c.admin]), personId: person?.id || null, attendanceRows: 0 });
      if (person && norm(r[c.name])) hubName.set(key(r[c.name]), new Set([...(hubName.get(key(r[c.name])) || []), person.id]));
    }
  }

  /* Attendance */
  const attRows = tab(book, 'Attendance');
  const candidates = new Map<string, { a: Attendance; row: number; complete: boolean }[]>();
  let attendanceRows = 0;
  if (!attRows) problems.push('There is no Attendance tab.');
  else {
    const c = columns(attRows, { date: ['date'], email: ['email'], mode: ['mode'], in: ['checkin'], out: ['checkout'], notes: ['notes', 'note'] });
    if (!c) problems.push('The Attendance tab needs Date, Email, Mode, CheckIn, CheckOut and Notes columns.');
    else for (const { r, row } of body(attRows)) {
      attendanceRows++;
      const email = norm(r[c.email]).toLowerCase();
      const person = byEmail.get(email);
      const match = team.find((t) => t.email === email);
      if (match) match.attendanceRows++;
      if (!person) { skipped.push({ tab: 'Attendance', row, why: email ? `${email} is not on your studio team` : 'No email' }); continue; }
      const date = dateOf(r[c.date]);
      if (!date) { skipped.push({ tab: 'Attendance', row, why: `The date "${norm(r[c.date])}" could not be read` }); continue; }
      const inS = secondsOf(r[c.in]);
      if (inS == null) { skipped.push({ tab: 'Attendance', row, why: 'No check-in time' }); continue; }
      const mode = modeOf(r[c.mode]);
      const flags: string[] = [];
      if (!mode) flags.push(`Mode "${norm(r[c.mode])}" read as Office`);
      const outS = secondsOf(r[c.out]);
      let checkOut: string | undefined;
      if (outS == null) flags.push('No check-out was recorded');
      else {
        const later = outS <= inS ? outS + 86400 : outS;
        if (outS <= inS) flags.push('Checked out after midnight');
        checkOut = instantOf(date, later);
      }
      const notes = norm(r[c.notes]).slice(0, 120);
      const a: Attendance = {
        id: `${IMPORT_PREFIX}at_${person.id}_${date}`,
        employeeId: person.id,
        date,
        checkIn: instantOf(date, inS),
        ...(checkOut ? { checkOut } : {}),
        mode: mode || 'Office',
        site: (mode || 'Office') === 'Site' ? notes : '',
        version: 1,
        checkInLocation: null,
        imported: provenance('Attendance', row, flags),
      };
      const k = `${person.id}:${date}`;
      candidates.set(k, [...(candidates.get(k) || []), { a, row, complete: !!checkOut }]);
    }
  }
  const attendance: Attendance[] = [];
  let duplicates = 0;
  for (const [k, list] of candidates) {
    if (list.length === 1) { attendance.push(list[0].a); continue; }
    duplicates++;
    /* The default keeps the most complete row: checked out, then the earliest check-in. */
    const best = [...list].sort((x, y) => Number(y.complete) - Number(x.complete) || x.a.checkIn.localeCompare(y.a.checkIn))[0];
    const chosen = list.find((x) => x.row === choices.keepRow?.[k]) || best;
    const [pid, date] = k.split(':');
    const who = people.find((p) => p.id === pid)?.name || pid;
    questions.push({
      kind: 'duplicate', id: k, blocking: false, answer: String(chosen.row),
      title: `${who} has ${list.length} attendance rows on ${date}`,
      detail: 'StudioDesk keeps one session a day. The others stay in the workbook.',
      options: list.map((x) => ({ value: String(x.row), label: `Row ${x.row}: ${timeLabel(x.a.checkIn)}–${x.a.checkOut ? timeLabel(x.a.checkOut) : 'no check-out'}, ${x.a.mode}` })),
    });
    attendance.push({ ...chosen.a, imported: { ...chosen.a.imported!, flags: [...chosen.a.imported!.flags, `One of ${list.length} rows for this day`] } });
    for (const x of list) if (x !== chosen) skipped.push({ tab: 'Attendance', row: x.row, why: `Another row for ${who} on ${date} was kept` });
  }

  /* Leaves */
  const leaveRows = tab(book, 'Leaves');
  const requests: RequestRecord[] = [];
  const byStatus: Partial<Record<Status, number>> = {};
  let leaveCount = 0, halfDays = 0;
  const seen = new Map<string, number>();
  const asked = new Set<string>();
  if (!leaveRows) problems.push('There is no Leaves tab.');
  else {
    const c = columns(leaveRows, {
      created: ['createdat', 'created'], req: ['reqid', 'requestid', 'id'], name: ['name'], start: ['start'], end: ['end'], type: ['type'],
      half: ['half'], reason: ['reason'], status: ['status'], by: ['approvedby'], at: ['approvedat'],
    });
    if (!c) problems.push('The Leaves tab needs CreatedAt, ReqID, Name, Start, End, Type, Half, Reason, Status, ApprovedBy and ApprovedAt columns.');
    else for (const { r, row } of body(leaveRows)) {
      leaveCount++;
      const name = norm(r[c.name]);
      const nk = key(name);
      /* Who: the exact name on the Team tab, else on the studio's team, else the admin says. */
      const fromHub = [...(hubName.get(nk) || [])];
      const fromStudio = (studioByName.get(nk) || []).map((p) => p.id);
      const candidatesFor = fromHub.length ? fromHub : fromStudio;
      let personId: string | null = candidatesFor.length === 1 ? candidatesFor[0] : null;
      if (choices.nameTo && Object.prototype.hasOwnProperty.call(choices.nameTo, nk)) personId = choices.nameTo[nk] || null;
      if (!personId || !people.some((p) => p.id === personId)) {
        if (!asked.has(nk)) {
          asked.add(nk);
          questions.push({
            kind: 'name', id: nk, blocking: false, answer: choices.nameTo?.[nk] ?? '',
            title: name ? `Who is "${name}"?` : 'Leave rows with no name',
            detail: candidatesFor.length > 1 ? 'More than one person on your team has this name.' : 'Nobody on the Team tab or your studio team has exactly this name. Their leave rows are left out unless you choose someone.',
            options: [{ value: '', label: 'Leave their rows out' }, ...people.map((p) => ({ value: p.id, label: p.name }))],
          });
        }
        skipped.push({ tab: 'Leaves', row, why: name ? `"${name}" is not matched to anyone` : 'No name' });
        continue;
      }
      const type = leaveTypeOf(r[c.type]);
      if (!type) { skipped.push({ tab: 'Leaves', row, why: `Unknown leave type "${norm(r[c.type])}"` }); continue; }
      const status = statusOf(r[c.status]);
      if (!status) { skipped.push({ tab: 'Leaves', row, why: `Unknown status "${norm(r[c.status])}"` }); continue; }
      const start = dateOf(r[c.start]);
      const end = dateOf(r[c.end]) || start;
      if (!start || !end || end < start) { skipped.push({ tab: 'Leaves', row, why: 'The dates could not be read' }); continue; }
      const flags: string[] = [];
      let portion: Portion = 'Full day';
      if (yes(r[c.half])) {
        halfDays++;
        if (start !== end) { skipped.push({ tab: 'Leaves', row, why: 'A half day across more than one date' }); continue; }
        const half = choices.halfOf?.[row] || null;
        questions.push({
          kind: 'half', id: String(row), blocking: !half, answer: half,
          title: `${people.find((p) => p.id === personId)?.name}: half day on ${start}`,
          detail: `People Hub did not record which half (row ${row}, ${type}, ${status.toLowerCase()}).`,
          options: [{ value: 'First half', label: 'First half' }, { value: 'Second half', label: 'Second half' }],
        });
        if (!half) continue;
        portion = half;
      }
      /* The same request twice (People Hub kept some): bring it over once. */
      const twin = [personId, start, end, type, status, portion].join(':');
      if (seen.has(twin)) { skipped.push({ tab: 'Leaves', row, why: `The same request as row ${seen.get(twin)}` }); continue; }
      seen.set(twin, row);
      let days: { date: string; units: number }[] = [];
      try { days = leaveDays(start, end, portion, policy); } catch (e: any) {
        flags.push(`Not charged: ${e?.message || 'no working day'}`);
      }
      const createdAt = stampOf(r[c.created]) || instantOf(start, 10 * 3600);
      const reqId = norm(r[c.req]);
      const by = norm(r[c.by]);
      const decider = by ? (byEmail.get(by.toLowerCase()) || (studioByName.get(key(by)) || [])[0]) : undefined;
      const decided = status === 'Pending' ? [] : [{
        actorId: decider?.id || 'people-hub',
        at: stampOf(r[c.at]) || createdAt,
        status,
        note: `Decided in People Hub${by ? ` by ${by}` : ''}.`.slice(0, 1000),
      }];
      requests.push({
        id: `${IMPORT_PREFIX}rq_${reqId ? idPart(reqId) : `r${row}`}`,
        employeeId: personId,
        kind: 'leave',
        type,
        start,
        end,
        portion,
        days,
        reason: norm(r[c.reason]).slice(0, 1000),
        status,
        version: 1,
        createdAt,
        decisions: decided,
        imported: provenance('Leaves', row, flags),
      });
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    /* Two rows sharing People Hub's request ID would overwrite each other: keep the IDs apart. */
    const ids = new Map<string, number>();
    for (const q of requests) {
      const n = ids.get(q.id) || 0;
      ids.set(q.id, n + 1);
      if (n) q.id = `${q.id}-${n + 1}`;
    }
  }

  /* Holidays: the ones the studio does not have yet. */
  const holRows = tab(book, 'Holidays');
  const holidays: { date: string; name: string }[] = [];
  if (holRows) {
    const c = columns(holRows, { date: ['date'], name: ['name'] });
    if (!c) problems.push('The Holidays tab needs Date and Name columns.');
    else for (const { r, row } of body(holRows)) {
      const date = dateOf(r[c.date]);
      if (!date) { skipped.push({ tab: 'Holidays', row, why: 'The date could not be read' }); continue; }
      if (!policy.holidays.includes(date) && !holidays.some((h) => h.date === date)) holidays.push({ date, name: norm(r[c.name]).slice(0, 80) || 'Holiday' });
    }
  }

  /* Balances: compared, never applied. */
  const recon: Recon[] = [];
  const compGrants: CompGrant[] = [];
  const balRows = tab(book, 'Balances');
  if (balRows) {
    const c = columns(balRows, { email: ['email'], fy: ['fy', 'year'] });
    const head = (balRows[0] || []).map((h) => key(h).replace(/[\s_()/-]+/g, ''));
    const col = (h: string) => head.indexOf(h);
    if (!c) problems.push('The Balances tab needs Email and FY columns.');
    else for (const { r, row } of body(balRows)) {
      const person = byEmail.get(norm(r[c.email]).toLowerCase());
      const fy = (norm(r[c.fy]).match(/(\d{4})/) || [])[1];
      if (!person || !fy) { skipped.push({ tab: 'Balances', row, why: !person ? 'Not on your studio team' : 'No leave year' }); continue; }
      const num = (h: string) => { const i = col(h); const n = i < 0 ? NaN : Number(norm(r[i])); return Number.isFinite(n) ? n : null; };
      for (const t of ['PL', 'SL', 'CL', 'COMP'] as LeaveType[]) {
        const hubUsed = num(`${t.toLowerCase()}used`);
        const hubEntitled = t === 'COMP' ? num('compearned') : num(`${t.toLowerCase()}entitled`);
        if (hubUsed == null && hubEntitled == null) continue;
        const used = requests
          .filter((q) => q.employeeId === person.id && q.type === t && (q.status === 'Approved' || q.status === 'Cancellation requested'))
          .reduce((n, q) => n + q.days.filter((d) => fiscalYear(d.date, policy) === fy).reduce((m, d) => m + d.units, 0), 0);
        const own = person.entitlements?.[fy]?.[t];
        const entitled = own ?? policy.allowances[t];
        recon.push({ personId: person.id, name: person.name, fy, type: t, hubEntitled, hubUsed, used, entitled, agrees: hubUsed == null || Math.abs(hubUsed - used) < 0.01 });
        if (t === 'COMP' && hubEntitled && hubEntitled > 0 && own !== hubEntitled)
          compGrants.push({ personId: person.id, name: person.name, fy, earned: hubEntitled, current: own ?? null });
      }
    }
  }

  /* Settings: side by side, for the admin to set by hand. */
  const settings: SettingCompare[] = [];
  const setRows = tab(book, 'Settings');
  if (setRows) {
    const values = new Map(body(setRows).map(({ r }) => [key(r[0]).replace(/\s+/g, '_'), r[1]]));
    const pair = (label: string, k: string, studio: string) => {
      if (!values.has(k)) return;
      const hub = hoursOf(values.get(k)) || norm(values.get(k));
      settings.push({ label, hub, studio, same: hub === studio });
    };
    pair('Day starts', 'checkin_start', policy.start);
    pair('Late after', 'checkin_end', policy.lateAfter);
    pair('Day ends', 'office_end', policy.end);
    if (values.has('weekly_off')) {
      const hub = norm(values.get('weekly_off'));
      const studio = policy.weeklyOffDays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
      settings.push({ label: 'Weekly off', hub, studio, same: hub.toLowerCase().replace(/\s/g, '') === studio.toLowerCase().replace(/\s/g, '') });
    }
  }

  const matched = new Set(team.map((t) => t.personId).filter(Boolean));
  return {
    people: team,
    notInHub: people.filter((p) => p.active && !matched.has(p.id)),
    attendance: attendance.sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId)),
    requests,
    holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)),
    compGrants,
    questions,
    skipped,
    recon,
    settings,
    counts: {
      attendanceRows,
      leaveRows: leaveCount,
      noCheckout: attendance.filter((a) => !a.checkOut).length,
      duplicates,
      halfDays,
      byStatus,
    },
    blocking: questions.filter((q) => q.blocking).length,
    problems,
  };
}

/* ── Checked again on the server ─────────────────────────────────────────── */

const SAFE = /^[A-Za-z0-9_-]{1,160}$/;
export const BATCH_ID = /^ph-\d{8}-\d{6}-[a-z0-9]{4,8}$/;
const iso = (v: unknown) => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const isProvenance = (v: any, batch: string, t: string) =>
  v && v.from === 'people-hub' && v.batch === batch && v.tab === t && Number.isInteger(v.row) && v.row >= 2 && v.row <= 1_000_000 &&
  Array.isArray(v.flags) && v.flags.length <= 10 && v.flags.every((f: unknown) => typeof f === 'string' && f.length <= 200);

/**
 * Why an imported record cannot be saved, or null when it can. The server
 * runs this on every record, so a changed browser cannot write anything an
 * import would not.
 */
export function checkImported(kind: 'attendance' | 'request', v: any, batch: string, people: Person[]): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Not a record.';
  if (JSON.stringify(v).length > 4000) return 'Too large.';
  const person = people.find((p) => p.id === v.employeeId);
  if (!person) return 'Not on the studio team.';
  if (typeof v.id !== 'string' || !SAFE.test(v.id) || !v.id.startsWith(IMPORT_PREFIX)) return 'Bad ID.';
  if (v.version !== 1) return 'Bad version.';
  if (kind === 'attendance') {
    const allowed = ['id', 'employeeId', 'date', 'checkIn', 'checkOut', 'mode', 'site', 'version', 'checkInLocation', 'imported'];
    if (Object.keys(v).some((k) => !allowed.includes(k))) return 'Unexpected field.';
    if (v.id !== `${IMPORT_PREFIX}at_${v.employeeId}_${v.date}`) return 'Bad ID.';
    if (!validDate(v.date) || !iso(v.checkIn) || businessDate(v.checkIn) !== v.date) return 'Bad check-in.';
    if (v.checkOut !== undefined && (!iso(v.checkOut) || Date.parse(v.checkOut) <= Date.parse(v.checkIn) || Date.parse(v.checkOut) - Date.parse(v.checkIn) > 24 * 3600000)) return 'Bad check-out.';
    if (!['Office', 'Site', 'WFH'].includes(v.mode) || typeof v.site !== 'string' || v.site.length > 120) return 'Bad mode.';
    if (v.checkInLocation !== null) return 'Imported days carry no location.';
    if (!isProvenance(v.imported, batch, 'Attendance')) return 'Bad source.';
    return null;
  }
  const allowed = ['id', 'employeeId', 'kind', 'type', 'start', 'end', 'portion', 'days', 'reason', 'status', 'version', 'createdAt', 'decisions', 'imported'];
  if (Object.keys(v).some((k) => !allowed.includes(k))) return 'Unexpected field.';
  if (v.kind !== 'leave' || !Object.prototype.hasOwnProperty.call(LEAVE_LABELS, v.type)) return 'Bad type.';
  if (!validDate(v.start) || !validDate(v.end) || v.end < v.start || (Date.parse(v.end) - Date.parse(v.start)) / 86400000 > 60) return 'Bad dates.';
  if (!['Full day', 'First half', 'Second half'].includes(v.portion) || (v.portion !== 'Full day' && v.start !== v.end)) return 'Bad portion.';
  if (!Array.isArray(v.days) || v.days.length > 61 || !v.days.every((d: any) => d && validDate(d.date) && d.date >= v.start && d.date <= v.end && (d.units === 1 || d.units === 0.5) && Object.keys(d).length === 2)) return 'Bad days.';
  if (typeof v.reason !== 'string' || v.reason.length > 1000) return 'Bad reason.';
  if (!['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Cancelled'].includes(v.status)) return 'Bad status.';
  if (!iso(v.createdAt)) return 'Bad date asked.';
  if (!Array.isArray(v.decisions) || v.decisions.length > 1 || (v.status === 'Pending') !== (v.decisions.length === 0)) return 'Bad decision.';
  for (const d of v.decisions) {
    if (!d || Object.keys(d).length !== 4 || typeof d.actorId !== 'string' || !SAFE.test(d.actorId) || (d.actorId !== 'people-hub' && !people.some((p) => p.id === d.actorId))) return 'Bad decision.';
    if (!iso(d.at) || d.status !== v.status || typeof d.note !== 'string' || d.note.length > 1000) return 'Bad decision.';
  }
  if (!isProvenance(v.imported, batch, 'Leaves')) return 'Bad source.';
  return null;
}

/** A new import's ID: ph-YYYYMMDD-HHMMSS-xxxx, in the studio's time. */
export function newBatchId(now = new Date()): string {
  const d = businessDate(now).replace(/-/g, '');
  const t = timeLabel(now.toISOString()).replace(':', '') + String(now.getUTCSeconds()).padStart(2, '0');
  return `ph-${d}-${t}-${Math.random().toString(36).slice(2, 8).padEnd(4, '0')}`;
}

/** The plan's records, stamped with the import they belong to. */
export function stamp(plan: ImportPlan, batch: string): { attendance: Attendance[]; requests: RequestRecord[] } {
  return {
    attendance: plan.attendance.map((a) => ({ ...a, imported: { ...a.imported!, batch } })),
    requests: plan.requests.map((q) => ({ ...q, imported: { ...q.imported!, batch } })),
  };
}

/** The leave years an import touches, for its summary. */
export const yearsOf = (plan: ImportPlan, policy: Policy) =>
  [...new Set(plan.requests.flatMap((q) => q.days.map((d) => fiscalYear(d.date, policy))).concat(plan.attendance.map((a) => fiscalYear(a.date, policy))))].sort();
