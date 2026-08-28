import {
  ScheduleTask, ScheduleHold, WorkCalendar, ProjectSchedule, ScheduleGate,
} from '../types';

// ============================================================================
// schedule — the whole project as one dependency graph.
//
// Durations are WORKING days. The calendar turns those into real dates, which
// is what Execution Agreement clause 5.4.2 requires: "Timeline excludes
// Sundays, public holidays, labour holidays, building/society restricted days".
// Counting calendar days makes the date shown to a client differ from the date
// owed to them contractually.
//
// Everything here is pure. Dates are ISO 'YYYY-MM-DD' strings on the outside
// and integer day numbers on the inside — no Date arithmetic across timezones,
// because a schedule that shifts when the browser changes zone is worse than
// no schedule.
// ============================================================================

const MS_DAY = 86400000;

/** ISO date → integer day number (UTC midnight). */
export function toDayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / MS_DAY);
}

/** Integer day number → ISO date. */
export function toISO(day: number): string {
  const dt = new Date(day * MS_DAY);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (day: number): number => {
  const js = new Date(day * MS_DAY).getUTCDay();   // 0 = Sunday
  return (js + 6) % 7;
};

export const DEFAULT_CALENDAR: WorkCalendar = {
  workWeek: [true, true, true, true, true, true, false],  // Sunday off
  observeSecondSaturday: true,
  holidays: [
    // 2025
    { fromISO: '2025-01-26', days: 1, label: 'Republic Day' },
    { fromISO: '2025-03-14', days: 1, label: 'Holi' },
    { fromISO: '2025-04-18', days: 1, label: 'Good Friday' },
    { fromISO: '2025-05-01', days: 1, label: 'May Day' },
    { fromISO: '2025-08-15', days: 1, label: 'Independence Day' },
    { fromISO: '2025-10-02', days: 1, label: 'Gandhi Jayanti' },
    { fromISO: '2025-10-20', days: 1, label: 'Dussehra' },
    { fromISO: '2025-11-20', days: 1, label: 'Diwali' },
    { fromISO: '2025-12-25', days: 1, label: 'Christmas' },
    // 2026
    { fromISO: '2026-01-26', days: 1, label: 'Republic Day' },
    { fromISO: '2026-03-06', days: 1, label: 'Holi' },
    { fromISO: '2026-04-03', days: 1, label: 'Good Friday' },
    { fromISO: '2026-05-01', days: 1, label: 'May Day' },
    { fromISO: '2026-08-15', days: 1, label: 'Independence Day' },
    { fromISO: '2026-10-02', days: 1, label: 'Gandhi Jayanti' },
    { fromISO: '2026-10-20', days: 1, label: 'Dussehra' },
    { fromISO: '2026-11-08', days: 1, label: 'Diwali' },
    { fromISO: '2026-12-25', days: 1, label: 'Christmas' },
    // 2027
    { fromISO: '2027-01-26', days: 1, label: 'Republic Day' },
    { fromISO: '2027-03-24', days: 1, label: 'Holi' },
    { fromISO: '2027-03-26', days: 1, label: 'Good Friday' },
    { fromISO: '2027-05-01', days: 1, label: 'May Day' },
    { fromISO: '2027-08-15', days: 1, label: 'Independence Day' },
    { fromISO: '2027-10-02', days: 1, label: 'Gandhi Jayanti' },
    { fromISO: '2027-10-09', days: 1, label: 'Dussehra' },
    { fromISO: '2027-10-29', days: 1, label: 'Diwali' },
    { fromISO: '2027-12-25', days: 1, label: 'Christmas' },
  ],
};

const isSecondSaturday = (day: number): boolean => {
  if (weekdayOf(day) !== 5) return false;              // not a Saturday
  const dom = new Date(day * MS_DAY).getUTCDate();
  return dom >= 8 && dom <= 14;
};

/** Holiday lookup, expanded once per calendar rather than per query. */
const holidaySet = (cal: WorkCalendar): Set<number> => {
  const s = new Set<number>();
  (cal.holidays || []).forEach(h => {
    const from = toDayNum(h.fromISO);
    for (let i = 0; i < Math.max(1, h.days); i++) s.add(from + i);
  });
  return s;
};

export function isWorkingDay(cal: WorkCalendar, day: number, hol?: Set<number>): boolean {
  const holidays = hol || holidaySet(cal);
  if (holidays.has(day)) return false;
  if (cal.observeSecondSaturday && isSecondSaturday(day)) return false;
  return !!(cal.workWeek || DEFAULT_CALENDAR.workWeek)[weekdayOf(day)];
}

/** The first working day on or after `day`. */
export function nextWorkingDay(cal: WorkCalendar, day: number, hol?: Set<number>): number {
  const holidays = hol || holidaySet(cal);
  let d = day, guard = 0;
  while (!isWorkingDay(cal, d, holidays) && guard++ < 400) d++;
  return d;
}

/**
 * The last day of a run of `workDays` working days beginning at `start`.
 * Inclusive: one working day starting Monday ends Monday.
 */
export function workSpanEnd(
  cal: WorkCalendar, start: number, workDays: number, hol?: Set<number>, blocked?: Set<number>,
): number {
  const holidays = hol || holidaySet(cal);
  const usable = (d: number) => isWorkingDay(cal, d, holidays) && !blocked?.has(d);
  if (workDays <= 0) return start;
  let d = start, guard = 0;
  while (!usable(d) && guard++ < 3000) d++;
  let counted = 1;
  while (counted < workDays && guard++ < 6000) {
    d++;
    if (usable(d)) counted++;
  }
  return d;
}

/** Working days in [a, b] inclusive. */
export function workingDaysBetween(cal: WorkCalendar, a: number, b: number, hol?: Set<number>): number {
  const holidays = hol || holidaySet(cal);
  if (b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d++) if (isWorkingDay(cal, d, holidays)) n++;
  return n;
}

/** Push a day forward by N working days (used when a hold is applied). */
export function shiftByWorkingDays(cal: WorkCalendar, day: number, workDays: number, hol?: Set<number>): number {
  const holidays = hol || holidaySet(cal);
  if (workDays <= 0) return day;
  let d = day, moved = 0;
  while (moved < workDays) {
    d++;
    if (isWorkingDay(cal, d, holidays)) moved++;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
export const GATE_LABEL: Record<ScheduleGate, string> = {
  sof: 'Selections frozen',
  gfc: 'Drawings issued',
  payment: 'Commercial cleared',
  site: 'Site ready',
};

export interface ResolvedTask extends ScheduleTask {
  startISO: string;
  endISO: string;
  startDay: number;
  endDay: number;
  /** Gates still open. A task with open gates cannot actually begin. */
  openGates: ScheduleGate[];
  /** Holds that hit this task, and the working days they cost it. */
  heldBy: { holdId: string; reason: string; workDays: number }[];
  /** Working days this task can slip without moving the finish date. */
  floatDays: number;
  onCriticalPath: boolean;
  /** Set when a pinned task is scheduled earlier than its dependencies allow. */
  pinConflict?: string;
  /** Procurement only: the last day an order can be placed. */
  orderByISO?: string;
  slipDays: number;
  originalWorkDays?: number;
}

export interface ScheduleResult {
  tasks: ResolvedTask[];
  startISO: string | null;
  finishISO: string | null;
  /** Working days past targetHandoverISO; negative means inside target. */
  overrunWorkDays: number | null;
  criticalPath: string[];
  cycles: string[];
  totalSlipDays: number;
  compressionInfo?: {
    isCompressed: boolean;
    compressionFactor: number;
    shortfallDays: number;
    availableWorkingDays: number;
    requiredWorkingDays: number;
    sundaysCount: number;
    holidaysCount: number;
    originalFinishISO: string;
  };
}

/** Kahn topological sort. A cycle is reported, never spun on. */
function topoOrder(tasks: ScheduleTask[]): { order: string[]; cycles: string[] } {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  tasks.forEach(t => {
    indeg.set(t.id, 0);
    out.set(t.id, []);
  });
  tasks.forEach(t => (t.dependencies || []).forEach(d => {
    if (!byId.has(d)) return;                       // dangling dep is ignored, not fatal
    indeg.set(t.id, (indeg.get(t.id) || 0) + 1);
    out.get(d)!.push(t.id);
  }));

  const queue = tasks.filter(t => (indeg.get(t.id) || 0) === 0).map(t => t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    (out.get(id) || []).forEach(n => {
      indeg.set(n, (indeg.get(n) || 0) - 1);
      if ((indeg.get(n) || 0) === 0) queue.push(n);
    });
  }
  const cycles = tasks.filter(t => !order.includes(t.id)).map(t => t.id);
  return { order, cycles };
}

/** Holds that apply to a given task. */
const holdsFor = (task: ScheduleTask, holds: ScheduleHold[]): ScheduleHold[] =>
  (holds || []).filter(h => !h.liftedAt && (h.scope === 'site' || (h.scope === 'trade' && h.target === task.trade)));

/**
 * A hold is a window in which the affected scope cannot work — not a delay
 * added to every task it touches.
 *
 * Treating it as an additive delay compounds it down the dependency chain: a
 * 3-day site hold pushed carpentry by 3, then painting by another 3 because it
 * follows carpentry, then handover by another 3. Ten working days of holds
 * moved the finish by sixty-two calendar days, and the variance report counted
 * the same hold three times. Blocking the days instead delays the chain once.
 */
function blockedDaysFor(
  task: ScheduleTask, holds: ScheduleHold[], cal: WorkCalendar, hol: Set<number>,
): { blocked: Set<number>; hits: ScheduleHold[] } {
  const blocked = new Set<number>();
  const hits: ScheduleHold[] = [];
  holdsFor(task, holds).forEach(h => {
    const from = toDayNum(h.fromISO);
    const to = workSpanEnd(cal, from, h.workDays, hol);
    for (let d = from; d <= to; d++) blocked.add(d);
    hits.push(h);
  });
  return { blocked, hits };
}

/**
 * Resolve every date from dependencies, the calendar, holds and pins.
 *
 * Forward pass sets earliest starts; a backward pass gives float, and zero
 * float is the critical path — the chain that actually moves the handover date.
 */
/**
 * Internal helper to run a single scheduling pass.
 */
function runSchedulePass(
  tasksToRun: ScheduleTask[],
  schedule: ProjectSchedule,
  cal: WorkCalendar,
  hol: Set<number>
) {
  const byId = new Map(tasksToRun.map(t => [t.id, t]));
  const { order, cycles } = topoOrder(tasksToRun);
  const resolved = new Map<string, ResolvedTask>();

  const anchor = schedule.projectStartISO
    ? toDayNum(schedule.projectStartISO)
    : (tasksToRun.reduce((min, t) => {
        const c = t.notBeforeISO ? toDayNum(t.notBeforeISO) : null;
        return c != null && (min == null || c < min) ? c : min;
      }, null as number | null) ?? toDayNum(toISO(Math.floor(Date.now() / MS_DAY))));

  order.forEach(id => {
    const t = byId.get(id)!;

    // Earliest from dependencies: the day after the last predecessor ends.
    let start = t.notBeforeISO ? toDayNum(t.notBeforeISO) : anchor;
    if (schedule.projectStartISO && (!t.dependencies || t.dependencies.length === 0)) {
      start = toDayNum(schedule.projectStartISO);
    }

    (t.dependencies || []).forEach(dep => {
      const r = resolved.get(dep);
      if (r) start = Math.max(start, r.endDay + 1);
    });

    const actualStart = t.actualStartISO ? toDayNum(t.actualStartISO) : null;
    const actualEnd = t.actualEndISO ? toDayNum(t.actualEndISO) : null;
    if (actualStart != null) start = actualStart;

    const { blocked, hits } = actualEnd != null
      ? { blocked: new Set<number>(), hits: [] as ScheduleHold[] }
      : blockedDaysFor(t, schedule.holds || [], cal, hol);

    if (actualStart == null) {
      start = nextWorkingDay(cal, start, hol);
      let guard = 0;
      while (blocked.has(start) && guard++ < 3000) start = nextWorkingDay(cal, start + 1, hol);
    }

    const unblockedEnd = workSpanEnd(cal, start, t.workDays, hol);
    const blockedEnd = workSpanEnd(cal, start, t.workDays, hol, blocked);
    const heldBy: ResolvedTask['heldBy'] = hits
      .filter(() => blockedEnd > unblockedEnd || blocked.has(start))
      .map(h => ({ holdId: h.id, reason: h.reason, workDays: h.workDays }));

    let pinConflict: string | undefined;
    if (t.pinned && t.baselineStartISO) {
      const pinnedDay = toDayNum(t.baselineStartISO);
      if (start > pinnedDay) {
        pinConflict = `Pinned to ${t.baselineStartISO}, but predecessors do not clear until ${toISO(start)}`;
      }
      start = pinnedDay;
    }

    const end = actualEnd != null ? actualEnd : workSpanEnd(cal, start, t.workDays, hol, blocked);
    const openGates = actualEnd != null ? []
      : (Object.keys(t.gates || {}) as ScheduleGate[]).filter(g => t.gates![g] === false);

    const baseStart = t.baselineStartISO ? toDayNum(t.baselineStartISO) : null;
    const slipDays = baseStart == null ? 0 : workingDaysBetween(cal, baseStart, start, hol) - 1;

    resolved.set(id, {
      ...t,
      startDay: start,
      endDay: end,
      startISO: toISO(start),
      endISO: toISO(end),
      openGates,
      heldBy,
      floatDays: 0,
      onCriticalPath: false,
      pinConflict,
      slipDays: Math.max(0, slipDays),
      orderByISO: t.kind === 'procurement' && t.leadTimeDays
        ? toISO(start - t.leadTimeDays)
        : undefined,
    });
  });

  cycles.forEach(id => {
    const t = byId.get(id)!;
    const end = workSpanEnd(cal, anchor, t.workDays, hol);
    resolved.set(id, {
      ...t, startDay: anchor, endDay: end, startISO: toISO(anchor), endISO: toISO(end),
      openGates: [], heldBy: [], floatDays: 0, onCriticalPath: false, slipDays: 0,
    });
  });

  const all = Array.from(resolved.values());
  const finishDay = all.length ? Math.max(...all.map(r => r.endDay)) : null;

  const successors = new Map<string, string[]>();
  all.forEach(r => successors.set(r.id, []));
  all.forEach(r => (r.dependencies || []).forEach(d => successors.get(d)?.push(r.id)));

  const latestFinish = new Map<string, number>();
  [...order].reverse().forEach(id => {
    const succ = successors.get(id) || [];
    const lf = succ.length
      ? Math.min(...succ.map(s => (latestFinish.get(s) ?? finishDay!) - (resolved.get(s)?.workDays ? workSpanEnd(cal, resolved.get(s)!.startDay, resolved.get(s)!.workDays, hol) - resolved.get(s)!.startDay + 1 : 1)))
      : (finishDay ?? 0);
    latestFinish.set(id, lf);
  });

  all.forEach(r => {
    const lf = latestFinish.get(r.id) ?? r.endDay;
    r.floatDays = Math.max(0, workingDaysBetween(cal, r.endDay, lf, hol) - 1);
    r.onCriticalPath = r.floatDays === 0;
  });

  const criticalPath = order.filter(id => resolved.get(id)?.onCriticalPath);
  const startDay = all.length ? Math.min(...all.map(r => r.startDay)) : null;

  return {
    tasks: all,
    startDay,
    finishDay,
    criticalPath,
    cycles,
    totalSlipDays: all.reduce((s, r) => Math.max(s, r.slipDays), 0),
  };
}

export function computeSchedule(schedule: ProjectSchedule): ScheduleResult {
  const cal = schedule.calendar || DEFAULT_CALENDAR;
  const hol = holidaySet(cal);
  let tasks = schedule.tasks || [];

  // Run the uncompressed pass first
  const basePass = runSchedulePass(tasks, schedule, cal, hol);

  const target = schedule.targetHandoverISO ? toDayNum(schedule.targetHandoverISO) : null;
  const startDay = basePass.startDay;
  const finishDay = basePass.finishDay;

  let compressionInfo: ScheduleResult['compressionInfo'] = undefined;

  if (target != null && finishDay != null && startDay != null && finishDay > target) {
    // We have an overrun! Let's calculate working days and non-working days
    const availableWorkingDays = workingDaysBetween(cal, startDay, target, hol);
    const requiredWorkingDays = workingDaysBetween(cal, startDay, finishDay, hol);
    const shortfallDays = requiredWorkingDays - availableWorkingDays;

    if (requiredWorkingDays > availableWorkingDays && availableWorkingDays > 0) {
      const compressionFactor = availableWorkingDays / requiredWorkingDays;

      // Count sundays and holidays in the window
      let sundaysCount = 0;
      let holidaysCount = 0;
      const holidaysSetObj = holidaySet(cal);
      for (let d = startDay; d <= target; d++) {
        const wd = weekdayOf(d);
        if (wd === 6) { // Sunday is index 6
          sundaysCount++;
        } else if (holidaysSetObj.has(d)) {
          holidaysCount++;
        }
      }

      // Re-run schedule with compressed durations for all non-completed, non-milestone tasks
      const compressedTasks = tasks.map(t => {
        if (t.status === 'completed' || t.kind === 'milestone') {
          return { ...t, originalWorkDays: t.workDays };
        }
        const compressedDays = Math.max(1, Math.round(t.workDays * compressionFactor));
        return {
          ...t,
          originalWorkDays: t.workDays,
          workDays: compressedDays,
        };
      });

      const compressedPass = runSchedulePass(compressedTasks, schedule, cal, hol);
      
      compressionInfo = {
        isCompressed: true,
        compressionFactor,
        shortfallDays,
        availableWorkingDays,
        requiredWorkingDays,
        sundaysCount,
        holidaysCount,
        originalFinishISO: toISO(finishDay),
      };

      return {
        tasks: compressedPass.tasks.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay),
        startISO: compressedPass.startDay != null ? toISO(compressedPass.startDay) : null,
        finishISO: compressedPass.finishDay != null ? toISO(compressedPass.finishDay) : null,
        overrunWorkDays: target != null && compressedPass.finishDay != null
          ? (compressedPass.finishDay > target ? workingDaysBetween(cal, target, compressedPass.finishDay, hol) - 1
                                                : -(workingDaysBetween(cal, compressedPass.finishDay, target, hol) - 1))
          : null,
        criticalPath: compressedPass.criticalPath,
        cycles: compressedPass.cycles,
        totalSlipDays: compressedPass.totalSlipDays,
        compressionInfo,
      };
    }
  }

  // Otherwise, return standard (uncompressed) schedule
  return {
    tasks: basePass.tasks.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay),
    startISO: startDay != null ? toISO(startDay) : null,
    finishISO: finishDay != null ? toISO(finishDay) : null,
    overrunWorkDays: target != null && finishDay != null
      ? (finishDay > target ? workingDaysBetween(cal, target, finishDay, hol) - 1
                            : -(workingDaysBetween(cal, finishDay, target, hol) - 1))
      : null,
    criticalPath: basePass.criticalPath,
    cycles: basePass.cycles,
    totalSlipDays: basePass.totalSlipDays,
  };
}

// ---------------------------------------------------------------------------
// Attribution — a slip nobody can explain is just a moved date
// ---------------------------------------------------------------------------
export interface VarianceRow { taskId: string; title: string; days: number; cause: string; }

/**
 * Each hold is counted ONCE, against the first task it hits. A site-wide hold
 * touches every downstream task, and charging it to each of them would inflate
 * the total — the report has to reconcile with `daysLostByReason`, or the two
 * panels on the same screen disagree.
 */
export function varianceReport(result: ScheduleResult): { rows: VarianceRow[]; totalDays: number } {
  const rows: VarianceRow[] = [];
  const chargedHolds = new Set<string>();

  result.tasks.forEach(t => {
    // 1. Holds — charged once each, to the first task they hit. A site-wide
    //    hold touches everything downstream; billing it to each would turn one
    //    three-day stoppage into nine.
    t.heldBy.forEach(h => {
      if (chargedHolds.has(h.holdId)) return;
      chargedHolds.add(h.holdId);
      rows.push({ taskId: t.id, title: t.title, days: h.workDays, cause: h.reason });
    });

    // 2. A task whose duration was extended beyond its baseline. This is the
    //    only other loss the schedule can *measure*: a later start is either a
    //    hold (above) or delay inherited from a predecessor, and inherited
    //    delay belongs to whoever caused it, not to the task that waited.
    if (t.baselineWorkDays != null && t.workDays > t.baselineWorkDays) {
      rows.push({
        taskId: t.id, title: t.title, days: t.workDays - t.baselineWorkDays,
        cause: t.openGates.length
          ? `Extended — waiting on ${t.openGates.map(g => GATE_LABEL[g]).join(' and ')}`
          : 'Duration extended',
      });
    }
  });

  return { rows: rows.sort((a, b) => b.days - a.days), totalDays: rows.reduce((s, r) => s + r.days, 0) };
}

/**
 * Days lost per reason. Answers "what did non-payment actually cost us".
 *
 * Pass the resolved schedule to count only holds that *bit*. A hold recorded
 * over a window when that trade was not working costs nothing, and counting it
 * makes this panel disagree with the variance report on the same screen — the
 * schedule would claim seven days lost while the finish date had not moved.
 */
export function daysLostByReason(
  holds: ScheduleHold[],
  result?: ScheduleResult,
): { reason: string; days: number; scopes: string[]; effective: boolean }[] {
  const bit = result
    ? new Set(result.tasks.flatMap(t => t.heldBy.map(h => h.holdId)))
    : null;

  const m = new Map<string, { days: number; scopes: Set<string>; effective: boolean }>();
  (holds || []).forEach(h => {
    const effective = !bit || bit.has(h.id);
    if (!effective) return;                       // declared, but cost nothing
    const cur = m.get(h.reason) || { days: 0, scopes: new Set<string>(), effective: true };
    cur.days += h.workDays;
    cur.scopes.add(h.scope === 'site' ? 'whole site' : (h.target || 'trade'));
    m.set(h.reason, cur);
  });
  return [...m.entries()]
    .map(([reason, v]) => ({ reason, days: v.days, scopes: [...v.scopes], effective: v.effective }))
    .sort((a, b) => b.days - a.days);
}

/** Holds that were recorded but did not delay anything, so the UI can say so. */
export function ineffectiveHolds(holds: ScheduleHold[], result: ScheduleResult): ScheduleHold[] {
  const bit = new Set(result.tasks.flatMap(t => t.heldBy.map(h => h.holdId)));
  return (holds || []).filter(h => !h.liftedAt && !bit.has(h.id));
}

/** Freeze the current dates as the baseline. Called once, at Design Gate close. */
export function freezeBaseline(schedule: ProjectSchedule): ProjectSchedule {
  const result = computeSchedule(schedule);
  const byId = new Map(result.tasks.map(t => [t.id, t]));
  return {
    ...schedule,
    baselineAt: Date.now(),
    tasks: schedule.tasks.map(t => {
      const r = byId.get(t.id);
      return r ? { ...t, baselineStartISO: r.startISO, baselineWorkDays: t.workDays } : t;
    }),
  };
}

/**
 * Manually set where a task has actually got to.
 *
 * The site is the authority, not the plan. Marking done stamps real dates, and
 * from then on the task is anchored: holds and slipping predecessors stop
 * moving it, because work that happened cannot be rescheduled.
 *
 * Re-opening clears the actuals so the task returns to being computed.
 */
export function setTaskProgress(
  schedule: ProjectSchedule,
  taskId: string,
  status: ScheduleTask['status'],
  opts: { onISO?: string; resolved?: ResolvedTask } = {},
): ProjectSchedule {
  const today = toISO(Math.floor(Date.now() / MS_DAY));
  const when = opts.onISO || today;

  return {
    ...schedule,
    tasks: schedule.tasks.map(t => {
      if (t.id !== taskId) return t;

      if (status === 'completed') {
        // Keep a real start if we have one; otherwise take the computed start,
        // so a task marked done in one click still has an honest span.
        //
        // But never end before starting: marking something done that was not
        // due to begin until next week would otherwise record a negative span.
        // Finished early means it started and finished on the same day.
        const planned = t.actualStartISO || opts.resolved?.startISO;
        const startISO = planned && planned <= when ? planned : when;   // ISO strings sort correctly
        return { ...t, status, actualStartISO: startISO, actualEndISO: when };
      }
      if (status === 'in_progress') {
        return { ...t, status, actualStartISO: t.actualStartISO || when, actualEndISO: undefined };
      }
      // Back to pending — forget the actuals and let it be computed again.
      return { ...t, status, actualStartISO: undefined, actualEndISO: undefined };
    }),
  };
}

/** Tasks a hold would move, so the UI can preview before committing. */
export function holdImpact(schedule: ProjectSchedule, hold: ScheduleHold): {
  moved: string[]; pinnedBlocked: string[];
} {
  const direct = schedule.tasks.filter(t =>
    t.status !== 'completed' &&
    (hold.scope === 'site' || (hold.scope === 'trade' && t.trade === hold.target)));

  const moved = new Set<string>();
  const walk = (id: string) => {
    if (moved.has(id)) return;
    moved.add(id);
    schedule.tasks.filter(t => (t.dependencies || []).includes(id)).forEach(t => walk(t.id));
  };
  direct.forEach(t => walk(t.id));

  const pinnedBlocked = schedule.tasks.filter(t => moved.has(t.id) && t.pinned).map(t => t.title);
  return { moved: [...moved], pinnedBlocked };
}
