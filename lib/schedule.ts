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
  /*
    Working days this task's forecast has been pushed out purely because it is
    unfinished and time has passed — not because of a hold, a gate or a
    predecessor. It is the number the studio would otherwise have had to work
    out by eye and then type in as a new end date.
  */
  driftDays: number;
  /** Started, not finished, and already past the day it was meant to end. */
  overrunning: boolean;
  /** Work the Design Gate holds back: execution or procurement downstream of it. */
  behindDesignGate: boolean;
  /**
   * Released to start early, but a predecessor is still waiting for the gate,
   * so it cannot actually move. Named, so the studio can release that too.
   */
  earlyStartHeldBy?: { id: string; title: string };
  /** Neither started nor finished, and the day it should have begun has passed. */
  overdueToStart: boolean;

  /*
    Where the PROGRAMME puts this work, as opposed to where it can still happen.

    `startDay`/`endDay` are a forecast: unstarted work is pulled forward to today
    because it cannot be done in the past, and unfinished work keeps extending.
    That is the right answer for "when will this project finish", and the wrong
    one for "what is the plan" -- every task on a back-dated programme is in the
    past, so the forecast collapses the whole thing onto today. A start moved
    back to June redrew every bar in September, which made the project start
    look unmovable.

    These four are the plan: the same anchor, constraints, dependencies, holds
    and pins, resolved WITHOUT the today rule. Dependencies chain planned-to-
    planned, so the shape of the programme is preserved end to end. Actual start
    and end dates still win over both, because those are what happened.

    The chart draws these. Lateness has its own reporting -- `overdueToStart`,
    `overrunning`, `driftDays` -- and does not need to move a bar to say so.
  */
  plannedStartDay: number;
  plannedEndDay: number;
  plannedStartISO: string;
  plannedEndISO: string;
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
  /**
   * Present when the forecast handover lands past the target: what it would
   * take to get back. Reported, never applied — see the note in computeSchedule.
   */
  catchUp?: {
    /** Remaining work would have to run at this fraction of its planned length. */
    factor: number;
    shortfallDays: number;
    availableWorkingDays: number;
    requiredWorkingDays: number;
    sundaysCount: number;
    holidaysCount: number;
    forecastFinishISO: string;
  };
}

// ---------------------------------------------------------------------------
// The two milestones the programme is built around
// ---------------------------------------------------------------------------
export const isDesignGateTask = (t: Pick<ScheduleTask, 'id' | 'kind' | 'title'>): boolean =>
  t.kind === 'milestone' && (t.id === 'ms-design-gate' || /design\s*gate/i.test(t.title || ''));

/* "Handover", "Final handover", "Handover & closeout" -- not "Pre-handover walkthrough". */
export const isHandoverTask = (t: Pick<ScheduleTask, 'id' | 'kind' | 'title'>): boolean =>
  t.kind === 'milestone' && (t.id === 'ms-handover' || /^\s*(final\s+|project\s+)?handover\b/i.test(t.title || ''));

/** Everything reachable downstream of `roots` through the stored dependencies. */
function downstreamOf(tasks: ScheduleTask[], roots: string[]): Set<string> {
  const succ = new Map<string, string[]>();
  tasks.forEach(t => (t.dependencies || []).forEach(d => {
    if (!succ.has(d)) succ.set(d, []);
    succ.get(d)!.push(t.id);
  }));
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    (succ.get(stack.pop()!) || []).forEach(n => {
      if (seen.has(n)) return;
      seen.add(n);
      stack.push(n);
    });
  }
  return seen;
}

interface EffectiveGraph {
  deps: Map<string, string[]>;
  behindGate: Set<string>;
  earlyStartHeldBy: Map<string, { id: string; title: string }>;
}

/**
 * The dependencies the schedule actually runs on, derived from the stored ones.
 *
 * Two milestones are rules rather than links, and storing them as links is how
 * they broke.
 *
 * Handover is last. It was stored as depending on whichever trade the builder
 * happened to create last, so a reorder, a deleted stage, a trade added later
 * or an edited predecessor left it pointing at the middle of the job: the
 * Design Gate moved and execution moved with it, but Handover stayed where it
 * was. It now waits for every task that does not itself come after it.
 *
 * The Design Gate holds back execution — except work the studio has released
 * early. Releasing demolition must not release everything chained after it,
 * so unreleased execution and procurement downstream of the gate are tied to
 * it directly, and a released task drops its link to the gate. On an intact
 * chain the direct tie changes nothing; it only matters once something ahead
 * of it has been let go.
 *
 * The stored dependencies are left alone: these are computed every time, so
 * a saved schedule picks the rules up without being rewritten.
 */
function effectiveGraph(tasks: ScheduleTask[]): EffectiveGraph {
  const deps = new Map(tasks.map(t => [t.id, [...(t.dependencies || [])]]));
  const byId = new Map(tasks.map(t => [t.id, t]));

  const gateIds = tasks.filter(isDesignGateTask).map(t => t.id);
  const handoverIds = new Set(tasks.filter(isHandoverTask).map(t => t.id));
  const behindGate = new Set<string>();
  const earlyStartHeldBy = new Map<string, { id: string; title: string }>();

  if (gateIds.length) {
    const gate = gateIds[0];
    downstreamOf(tasks, gateIds).forEach(id => {
      const t = byId.get(id);
      if (t && (t.kind === 'execution' || t.kind === 'procurement')) behindGate.add(id);
    });
    behindGate.forEach(id => {
      const t = byId.get(id)!;
      const own = deps.get(id)!;
      if (t.earlyStart) {
        deps.set(id, own.filter(d => !gateIds.includes(d)));
      } else if (!own.includes(gate)) {
        deps.set(id, [...own, gate]);
      }
    });
    behindGate.forEach(id => {
      const t = byId.get(id)!;
      if (!t.earlyStart) return;
      const holder = deps.get(id)!.map(d => byId.get(d))
        .find(d => d && behindGate.has(d.id) && !d.earlyStart);
      if (holder) earlyStartHeldBy.set(id, { id: holder.id, title: holder.title });
    });
  }

  if (handoverIds.size) {
    const after = downstreamOf(tasks, [...handoverIds]);
    const before = tasks
      .filter(t => !handoverIds.has(t.id) && !after.has(t.id))
      .map(t => t.id);
    handoverIds.forEach(id => {
      deps.set(id, Array.from(new Set([...deps.get(id)!.filter(d => !handoverIds.has(d)), ...before])));
    });
  }

  return { deps, behindGate, earlyStartHeldBy };
}

/**
 * What releasing `taskId` early has to release with it: the task, and every
 * stage ahead of it the Design Gate still holds. Upstream first.
 *
 * Demolition cannot start early while site setup in front of it waits for the
 * gate, so moving demolition ahead of the gate means moving both. Empty when
 * the task is not held by the gate at all.
 */
export function gateHeldChain(tasks: ScheduleTask[], taskId: string): string[] {
  const gateIds = tasks.filter(isDesignGateTask).map(t => t.id);
  if (!gateIds.length) return [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  const behind = downstreamOf(tasks, gateIds);
  const held = (id: string) => {
    const t = byId.get(id);
    return !!t && behind.has(id) && (t.kind === 'execution' || t.kind === 'procurement') && !t.earlyStart;
  };
  if (!held(taskId)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    (byId.get(id)?.dependencies || []).filter(held).forEach(walk);
    out.push(id);
  };
  walk(taskId);
  return out;
}

/**
 * Let a stage start before the Design Gate, with the stages ahead of it that
 * the gate would otherwise still hold. `startISO`, when given, is the earliest
 * the stage itself may begin.
 */
export function releaseBeforeGate(
  schedule: ProjectSchedule,
  taskId: string,
  reason: string,
  opts: { startISO?: string; at?: number } = {},
): ProjectSchedule {
  const chain = new Set(gateHeldChain(schedule.tasks || [], taskId));
  if (!chain.size) return schedule;
  const earlyStart = { reason, at: opts.at ?? Date.now() };
  return {
    ...schedule,
    tasks: schedule.tasks.map(t => {
      if (!chain.has(t.id)) return t;
      const next = { ...t, earlyStart };
      return t.id === taskId && opts.startISO ? { ...next, notBeforeISO: opts.startISO } : next;
    }),
  };
}

/** Kahn topological sort. A cycle is reported, never spun on. */
function topoOrder(tasks: ScheduleTask[], deps: Map<string, string[]>): { order: string[]; cycles: string[] } {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  tasks.forEach(t => {
    indeg.set(t.id, 0);
    out.set(t.id, []);
  });
  tasks.forEach(t => (deps.get(t.id) || []).forEach(d => {
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
  hol: Set<number>,
  today: number
) {
  const byId = new Map(tasksToRun.map(t => [t.id, t]));
  const graph = effectiveGraph(tasksToRun);
  const depsOf = (id: string) => graph.deps.get(id) || [];
  const { order, cycles } = topoOrder(tasksToRun, graph.deps);
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
    // `start` is the forecast, `pStart` the plan; they diverge only where the
    // today rule below applies, and are chained separately so neither drags the
    // other. See the note on `plannedStartDay`.
    let start = anchor;
    let pStart = anchor;
    if (schedule.projectStartISO && depsOf(id).length === 0) {
      start = toDayNum(schedule.projectStartISO);
      pStart = start;
    }
    /*
      `notBeforeISO` is a floor, not a suggestion — "the earliest the task may
      start regardless of dependencies". The project-start line above used to
      overwrite it outright for any task with no predecessors, so work deliberately
      held until a later date was scheduled at the start of the project instead.

      Harmless while nothing looked at whether a task was late; not harmless now,
      because work that cannot begin yet was being reported as overdue to start.
    */
    if (t.notBeforeISO) {
      const floor = toDayNum(t.notBeforeISO);
      start = Math.max(start, floor);
      pStart = Math.max(pStart, floor);
    }

    depsOf(id).forEach(dep => {
      const r = resolved.get(dep);
      if (r) {
        start = Math.max(start, r.endDay + 1);
        pStart = Math.max(pStart, r.plannedEndDay + 1);
      }
    });

    const actualStart = t.actualStartISO ? toDayNum(t.actualStartISO) : null;
    const actualEnd = t.actualEndISO ? toDayNum(t.actualEndISO) : null;
    if (actualStart != null) {
      start = actualStart;
      pStart = actualStart;
    }

    const { blocked, hits } = actualEnd != null
      ? { blocked: new Set<number>(), hits: [] as ScheduleHold[] }
      : blockedDaysFor(t, schedule.holds || [], cal, hol);

    if (actualStart == null) {
      start = nextWorkingDay(cal, start, hol);
      let guard = 0;
      while (blocked.has(start) && guard++ < 3000) start = nextWorkingDay(cal, start + 1, hol);

      pStart = nextWorkingDay(cal, pStart, hol);
      let pGuard = 0;
      while (blocked.has(pStart) && pGuard++ < 3000) pStart = nextWorkingDay(cal, pStart + 1, hol);
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
      pStart = pinnedDay;
    }

    /*
      Unfinished work cannot be scheduled in the past.

      This is what the timeline was missing. A stage that had started and not
      been closed kept the end date it was planned to have, so nothing after it
      moved: the studio had to notice the overrun, edit the end date by hand,
      and let every later stage shift from there. Two weeks of slippage looked
      exactly like a project on plan until somebody typed.

      Two halves of the same rule:

        - work that has not started cannot start before today, so a stage whose
          planned start has passed moves forward to today
        - work that has not finished cannot have finished before today, so a
          stage still open past its planned end keeps extending

      Either way the successors follow, because they are already scheduled from
      this task's end. Nothing is pushed that does not depend on it, which is
      why parallel work stays where it is.

      `status: 'completed'` counts as finished even without an actual end date:
      the studio has said it is done, and stretching it to today would contradict
      them. A pinned start is left alone — it is a date promised to someone, and
      `pinConflict` already reports it rather than moving it quietly.
    */
    const finished = actualEnd != null || t.status === 'completed';

    /*
      The plan is fixed here, before the today rule runs. Everything below this
      line moves the forecast only.
    */
    const plannedStartDay = pStart;
    const plannedEndDay = actualEnd != null
      ? actualEnd
      : workSpanEnd(cal, pStart, t.workDays, hol, blocked);

    let driftDays = 0;
    let overdueToStart = false;

    if (!finished && actualStart == null && !t.pinned && start < today) {
      const pushed = nextWorkingDay(cal, today, hol);
      driftDays = Math.max(0, workingDaysBetween(cal, start, pushed, hol) - 1);
      overdueToStart = pushed > start;
      start = pushed;
    }

    const plannedEnd = actualEnd != null ? actualEnd : workSpanEnd(cal, start, t.workDays, hol, blocked);

    let end = plannedEnd;
    let overrunning = false;
    if (!finished && plannedEnd < today) {
      end = nextWorkingDay(cal, today, hol);
      driftDays += Math.max(0, workingDaysBetween(cal, plannedEnd, end, hol) - 1);
      overrunning = actualStart != null || t.status === 'in_progress';
    }

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
      plannedStartDay,
      plannedEndDay,
      plannedStartISO: toISO(plannedStartDay),
      plannedEndISO: toISO(plannedEndDay),
      openGates,
      heldBy,
      floatDays: 0,
      onCriticalPath: false,
      pinConflict,
      slipDays: Math.max(0, slipDays),
      driftDays,
      overrunning,
      overdueToStart,
      behindDesignGate: graph.behindGate.has(id),
      earlyStartHeldBy: graph.earlyStartHeldBy.get(id),
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
      plannedStartDay: anchor, plannedEndDay: end,
      plannedStartISO: toISO(anchor), plannedEndISO: toISO(end),
      openGates: [], heldBy: [], floatDays: 0, onCriticalPath: false, slipDays: 0,
      driftDays: 0, overrunning: false, overdueToStart: false,
      behindDesignGate: graph.behindGate.has(id),
    });
  });

  const all = Array.from(resolved.values());
  const finishDay = all.length ? Math.max(...all.map(r => r.endDay)) : null;

  const successors = new Map<string, string[]>();
  all.forEach(r => successors.set(r.id, []));
  all.forEach(r => depsOf(r.id).forEach(d => successors.get(d)?.push(r.id)));

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
  /*
    The programme's own start, not the forecast's.

    `startISO` feeds the "Schedule start" figure, which is read as the date the
    project is anchored to. Taking it from the forecast made it today on every
    back-dated project -- the card said "configured start anchor" above a number
    that was nothing of the kind. The finish stays on the forecast, because that
    question really is "when will this be done".
  */
  const startDay = all.length ? Math.min(...all.map(r => r.plannedStartDay)) : null;

  /*
    Where the forecast begins, kept separate from where the programme does.

    Compression asks "can we still hit the target", which is a question about
    the forecast: it measures the days available between the start and the
    target against the days the work needs. Feeding it the PLANNED start while
    `finishDay` is a forecast measures two different things against each other
    -- on a back-dated project that inflates both windows by however far back
    the anchor sits, and the compression it computes is meaningless.
  */
  const forecastStartDay = all.length ? Math.min(...all.map(r => r.startDay)) : null;

  return {
    tasks: all,
    startDay,
    forecastStartDay,
    finishDay,
    criticalPath,
    cycles,
    totalSlipDays: all.reduce((s, r) => Math.max(s, r.slipDays), 0),
  };
}

/**
 * @param todayISO  The day to treat as today. Defaults to the real one; passed
 *                  explicitly by tests, and by anything rendering a schedule as
 *                  it stood on some other date.
 */
export function computeSchedule(schedule: ProjectSchedule, todayISO?: string): ScheduleResult {
  const cal = schedule.calendar || DEFAULT_CALENDAR;
  const hol = holidaySet(cal);
  const tasks = schedule.tasks || [];
  const today = toDayNum(todayISO || toISO(Math.floor(Date.now() / MS_DAY)));

  const pass = runSchedulePass(tasks, schedule, cal, hol, today);

  const target = schedule.targetHandoverISO ? toDayNum(schedule.targetHandoverISO) : null;
  const startDay = pass.startDay;
  const finishDay = pass.finishDay;
  /* Catch-up compares forecast against forecast -- see the note on forecastStartDay. */
  const forecastFrom = pass.forecastStartDay;

  /*
    A late forecast is reported, not squeezed back onto the target.

    This used to re-run the whole programme with every unfinished duration
    scaled down until the finish fitted the target handover. The effect was a
    Handover that would not move: each day the design ran late, the Design Gate
    moved later and the trades after it quietly got shorter, so the studio
    watched the gate slide while the handover sat still. Design steps were
    scaled too, and the factor came from the forecast while the chart draws the
    plan, so the dates it produced matched neither.

    Durations are the studio's to change. The figures that used to drive the
    squeeze are still worked out, as what catching up would take.
  */
  let catchUp: ScheduleResult['catchUp'] = undefined;
  if (target != null && finishDay != null && forecastFrom != null && finishDay > target) {
    const availableWorkingDays = workingDaysBetween(cal, forecastFrom, target, hol);
    const requiredWorkingDays = workingDaysBetween(cal, forecastFrom, finishDay, hol);
    if (requiredWorkingDays > availableWorkingDays && availableWorkingDays > 0) {
      let sundaysCount = 0;
      let holidaysCount = 0;
      for (let d = forecastFrom; d <= target; d++) {
        if (weekdayOf(d) === 6) sundaysCount++;
        else if (hol.has(d)) holidaysCount++;
      }
      catchUp = {
        factor: availableWorkingDays / requiredWorkingDays,
        shortfallDays: requiredWorkingDays - availableWorkingDays,
        availableWorkingDays,
        requiredWorkingDays,
        sundaysCount,
        holidaysCount,
        forecastFinishISO: toISO(finishDay),
      };
    }
  }

  /* Handover is the last row, whatever day anything else starts on. */
  const last = (t: ResolvedTask) => (isHandoverTask(t) ? 1 : 0);

  return {
    tasks: pass.tasks.sort((a, b) => last(a) - last(b) || a.startDay - b.startDay || a.endDay - b.endDay),
    startISO: startDay != null ? toISO(startDay) : null,
    finishISO: finishDay != null ? toISO(finishDay) : null,
    overrunWorkDays: target != null && finishDay != null
      ? (finishDay > target ? workingDaysBetween(cal, target, finishDay, hol) - 1
                            : -(workingDaysBetween(cal, finishDay, target, hol) - 1))
      : null,
    criticalPath: pass.criticalPath,
    cycles: pass.cycles,
    totalSlipDays: pass.totalSlipDays,
    catchUp,
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
/**
 * The tasks of one lane, in the order they actually run.
 *
 * Array position is not the order — a reorder rewires predecessors and leaves
 * the array alone, because the array is storage and the dependencies are the
 * schedule. Reading the sequence back therefore means walking the chain, which
 * two callers now need to do: the reorder itself, and the check that asks
 * whether the resulting sequence is buildable.
 *
 * Anything the links do not reach — a broken or branching chain — is appended
 * in array order rather than dropped, so the caller always gets every task in
 * the lane back.
 */
export function laneOrder(tasks: ScheduleTask[], kind: ScheduleTask['kind']): ScheduleTask[] {
  const lane = tasks.filter(t => t.kind === kind);
  if (lane.length < 2) return lane;

  const laneIds = new Set(lane.map(t => t.id));
  const inLaneDep = (t: ScheduleTask) => (t.dependencies || []).find(d => laneIds.has(d));
  const head = lane.find(t => !inLaneDep(t)) || lane[0];

  const ordered: ScheduleTask[] = [];
  const seen = new Set<string>();
  let cursor: ScheduleTask | undefined = head;
  while (cursor && !seen.has(cursor.id)) {
    ordered.push(cursor);
    seen.add(cursor.id);
    cursor = lane.find(t => inLaneDep(t) === cursor!.id);
  }
  lane.forEach(t => { if (!seen.has(t.id)) ordered.push(t); });
  return ordered;
}

/**
 * Move one task to sit after another in its lane, and rewire the chain.
 *
 * The Gantt's rows are a dependency graph, not a list, so "drag this above
 * that" only means something if it is translated into predecessors. Design and
 * execution each run as a chain of single-predecessor tasks — which is also
 * what the detail panel's Predecessor dropdown edits, one task at a time — so a
 * drag is that same edit for the whole lane at once: pull the task out of the
 * chain, splice it back in at its new position, and re-point everything after.
 *
 * Constrained deliberately:
 *
 *  - within one lane only. Execution is gated behind the whole design phase, so
 *    dragging a trade in among the drawings does not describe anything.
 *  - milestones stay put. The Design Gate depends on every design task rather
 *    than on one predecessor, and splicing it into a chain would silently
 *    replace that with a single link — the exact rule that stops construction
 *    starting before the drawings are done.
 *  - the lane's first task keeps whatever it depended on, so execution stays
 *    hung off the gate rather than floating free.
 *
 * Returns the original array when the move is not allowed, so callers can
 * compare by identity and do nothing.
 */
export function reorderTaskInLane(
  tasks: ScheduleTask[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after' = 'before',
): ScheduleTask[] {
  if (!tasks?.length || draggedId === targetId) return tasks;

  const dragged = tasks.find(t => t.id === draggedId);
  const target = tasks.find(t => t.id === targetId);
  if (!dragged || !target) return tasks;
  if (dragged.kind !== target.kind) return tasks;
  if (dragged.kind === 'milestone' || target.kind === 'milestone') return tasks;

  const lane = tasks.filter(t => t.kind === dragged.kind);
  if (lane.length < 2) return tasks;

  const laneIds = new Set(lane.map(t => t.id));
  const ordered = laneOrder(tasks, dragged.kind).slice();
  // Captured before the splice: after it, ordered[0] may be the dragged task.
  const head = ordered[0];

  const from = ordered.findIndex(t => t.id === draggedId);
  if (from < 0) return tasks;
  const [moved] = ordered.splice(from, 1);
  let to = ordered.findIndex(t => t.id === targetId);
  if (to < 0) return tasks;
  if (position === 'after') to += 1;
  ordered.splice(to, 0, moved);

  /*
    Whatever the lane hangs off belongs to the lane, not to the task that
    happened to be first.

    Execution depends on the Design Gate through its opening task. Moving a
    different trade to the front without carrying that link across left the
    whole execution lane with no predecessor at all — free to start before the
    drawings were done, which is the one thing the gate exists to prevent. The
    entry dependency is read from the old head and given to the new one.
  */
  const entryDeps = (head.dependencies || []).filter(d => !laneIds.has(d));

  const rewired = new Map<string, string[]>();
  ordered.forEach((t, i) => {
    const outside = (t.dependencies || []).filter(d => !laneIds.has(d));
    const merged = i === 0
      ? Array.from(new Set([...outside, ...entryDeps]))
      : [...outside, ordered[i - 1].id];
    rewired.set(t.id, merged);
  });

  return tasks.map(t => (rewired.has(t.id) ? { ...t, dependencies: rewired.get(t.id)! } : t));
}

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
