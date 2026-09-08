import { ProjectSchedule } from '../../types';
import { computeSchedule, ResolvedTask, toDayNum, toISO } from '../../lib/schedule';
import { ClientLifecycleSummary } from '../../services/clientPortalEngine';

/**
 * One dated programme, shared by the spine and the Gantt.
 *
 * Both used to invent their own axis. The spine had no dates at all, so its
 * left column showed "current" and "done" and nothing else; the Gantt fell back
 * to six evenly-spaced stage blocks labelled "stage 1..6" because it was
 * reading `projectData.timeline`, which is the legacy relative-day array and is
 * empty on every project that uses the real scheduler.
 *
 * The real programme is already in the portal: `clientSchedule` — the studio's
 * saved schedule, or one derived from the BOQ by `buildScheduleFromProject`.
 * Running it through `computeSchedule` gives every task a true start and end,
 * the same numbers the studio's own Timeline tab draws. This turns those tasks
 * into the six client-facing stages and hands both views the same months.
 *
 * Where the schedule genuinely has nothing, `dated` is false and the callers
 * say so rather than drawing a calendar nobody committed to.
 */

/** A dated point inside a stage — a design gate, a handover, a stage ending. */
export interface ProgrammeMilestone {
  id: string;
  label: string;
  dateISO: string;
  day: number;
  /** "14 Sept" — the day-level label the sub-spine prints. */
  date: string;
  done: boolean;
}

export interface ProgrammeStage {
  stageNumber: number;
  name: string;
  startISO: string;
  endISO: string;
  startDay: number;
  endDay: number;
  /** "Aug 2026" — what the spine prints in its left column. Always a month:
      the day belongs on the milestones inside the stage, not on the stage. */
  month: string;
  /**
   * False when the schedule has no task of its own for this stage. The studio's
   * design process may have two steps where the client lifecycle has six
   * stages, so several stages have no dated work behind them. Rather than show
   * nothing — which reads as an omission — such a stage is placed in the gap
   * between the neighbours that ARE scheduled, and flagged so the portal can
   * say the date is expected rather than set.
   */
  hasSchedule: boolean;
  status: 'completed' | 'active' | 'pending';
  /** Dated points within this stage, oldest first. */
  milestones: ProgrammeMilestone[];
}

export interface Programme {
  dated: boolean;
  /**
   * True when the studio saved this schedule. False means it was derived from
   * the BOQ by `buildScheduleFromProject`, whose design steps all start today —
   * a shape worth showing, but not dates anyone has committed to, and the
   * client must be told which they are looking at.
   */
  published: boolean;
  stages: ProgrammeStage[];
  startDay: number;
  endDay: number;
  todayDay: number;
  handoverLabel: string | null;
}

/**
 * Which lifecycle stage a scheduled task belongs to.
 *
 * The schedule is built from the studio's own process, so this is a reading of
 * that process rather than a guess: five design steps run from discovery to
 * sign-off across stages 1–4, the Design Gate closes stage 4, procurement and
 * every trade sit in stage 5, and the handover milestone is stage 6.
 */
function stageOfTask(t: ResolvedTask, designOrder: string[]): number {
  if (t.kind === 'milestone') {
    return /handover|closeout|snag/i.test(`${t.title} ${t.milestoneLabel || ''}`) ? 6 : 4;
  }
  if (t.kind === 'procurement' || t.kind === 'execution') return 5;

  /*
    Design steps run sequentially from stage 1, capped at stage 4.

    This used to send the LAST design step to stage 4 regardless of how many
    there were. With five steps that was fine; this studio's process has two, so
    step 2 jumped to "Agreement & Design Complete" and left stage 2 — the
    project's current stage — with no date at all, while stages 4 and 5 both
    showed the same month.

    Sequential is what the lifecycle actually means: the first design step is
    stage 1's work, the second is stage 2's, and a process shorter than the
    lifecycle simply leaves the later stages undated until the Design Gate.
  */
  const i = designOrder.indexOf(t.id);
  if (i < 0) return 1;
  return Math.min(i + 1, 4);
}

const dayOf = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const monthOf = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * The stage whose window contains a date. Used to file a record against the
 * stage it actually happened in, rather than against whatever is current —
 * a decision raised in July belongs to July's stage, not to today's.
 */
export function stageAtDate(programme: Programme, iso?: string | null): number | null {
  if (!programme.dated || !iso) return null;
  const day = toDayNum(String(iso).slice(0, 10));
  if (!Number.isFinite(day)) return null;
  const hit = programme.stages.find(s => day >= s.startDay && day <= s.endDay);
  if (hit) return hit.stageNumber;
  // Before the programme starts, it belongs to the first stage; after it ends,
  // to the last. Anything else would drop the record off the page.
  if (day < programme.startDay) return programme.stages[0]?.stageNumber ?? null;
  return programme.stages[programme.stages.length - 1]?.stageNumber ?? null;
}

export function buildProgramme(
  schedule: ProjectSchedule | null | undefined,
  lifecycle: ClientLifecycleSummary,
  published = false,
): Programme {
  const todayDay = toDayNum(toISO(Math.floor(Date.now() / 86400000)));

  const empty: Programme = {
    dated: false,
    published,
    stages: lifecycle.stages.map(s => ({
      stageNumber: s.stageNumber,
      name: s.shortName || s.name,
      startISO: '', endISO: '', startDay: 0, endDay: 0,
      month: '',
      hasSchedule: false,
      status: s.status,
      milestones: [],
    })),
    startDay: 0, endDay: 0, todayDay,
    handoverLabel: null,
  };

  if (!schedule || !schedule.tasks || schedule.tasks.length === 0) return empty;

  let result;
  try {
    result = computeSchedule(schedule);
  } catch {
    // A cyclic or malformed schedule must not take the client's portal down.
    return empty;
  }
  if (!result.tasks.length || !result.startISO || !result.finishISO) return empty;

  const designOrder = result.tasks.filter(t => t.kind === 'design').map(t => t.id);

  const windows = new Map<number, { s: number; e: number }>();
  /**
   * Milestones are the schedule's own zero-duration tasks — the Design Gate,
   * Handover, anything the studio added as a marker. They are the only points
   * in the programme that carry a meaningful *day* rather than a span, which
   * is why they belong inside the stage rather than on it.
   */
  const marks = new Map<number, ProgrammeMilestone[]>();
  result.tasks.forEach(t => {
    const stage = stageOfTask(t, designOrder);
    const cur = windows.get(stage);
    windows.set(stage, {
      s: cur ? Math.min(cur.s, t.startDay) : t.startDay,
      e: cur ? Math.max(cur.e, t.endDay) : t.endDay,
    });
    if (t.kind === 'milestone') {
      if (!marks.has(stage)) marks.set(stage, []);
      marks.get(stage)!.push({
        id: t.id,
        label: t.milestoneLabel || t.title,
        dateISO: t.startISO,
        day: t.startDay,
        done: t.status === 'done' || !!t.actualEndISO,
        date: '',
      });
    }
  });

  /*
    A stage with no task of its own is pinned to the end of the last stage that
    had one, and flagged. It used to be given that position silently, which is
    how four different stages all came to print "Aug 2026" — the studio's design
    process here is two steps long, so stages 2, 3, 5 and 6 had nothing behind
    them and every one of them borrowed the same neighbour's date.

    They keep a position so the spine stays in order; `hasSchedule: false` is
    what stops that position being shown as if it were a date.
  */
  const ordered = lifecycle.stages.map(s => s.stageNumber).sort((a, b) => a - b);
  const filled = new Map<number, { s: number; e: number; real: boolean }>();
  ordered.forEach(n => {
    const w = windows.get(n);
    if (w) filled.set(n, { ...w, real: true });
  });

  /*
    Stages the schedule says nothing about are placed, not left blank.

    They are spread evenly through the gap between the nearest scheduled stage
    before and the nearest after — so an unscheduled stage 3 sitting between a
    stage 2 that ends in August and a stage 4 that starts in October lands in
    September, which is where a reader would put it anyway. Flagged `real:
    false` so the portal can label it as expected rather than agreed.

    Before this they were pinned to the previous stage's end date and several
    stages printed the same month; showing nothing instead read as missing data.
  */
  /*
    Stages run in sequence, so their windows must too.

    The schedule overlaps by design — carpentry is planned to start while the
    last drawings are still being issued, which is how a build actually runs.
    Taken literally that gave stage 4 and stage 5 the same start month, and with
    the design gate also landing in August the spine printed "Aug 2026" against
    four stages in a row. True of the tasks; nonsense as a client's stage list.

    Each stage is therefore clamped to begin no earlier than the previous one
    ends. The Gantt still draws the real overlapping task bars — this is only
    the stage summary, which is the thing that has to read as a sequence.
  */
  let floor = -Infinity;
  ordered.forEach(n => {
    const w = filled.get(n);
    if (!w) return;
    const s = Math.max(w.s, floor);
    const e = Math.max(w.e, s);
    filled.set(n, { ...w, s, e });
    floor = e;
  });

  const scheduled = ordered.filter(n => filled.has(n));
  const firstDay = scheduled.length ? filled.get(scheduled[0])!.s : toDayNum(result.startISO);
  const lastDay = scheduled.length ? filled.get(scheduled[scheduled.length - 1])!.e : firstDay;

  ordered.forEach(n => {
    if (filled.has(n)) return;
    const before = [...ordered].filter(x => x < n && filled.has(x) && filled.get(x)!.real).pop();
    const after = ordered.find(x => x > n && filled.has(x) && filled.get(x)!.real);
    const from = before !== undefined ? filled.get(before)!.e : firstDay;
    const to = after !== undefined ? filled.get(after)!.s : lastDay;
    // How many unscheduled stages share this gap, and where this one sits in it.
    const gapStages = ordered.filter(x =>
      (before === undefined || x > before) && (after === undefined || x < after) && !windows.has(x));
    const idx = Math.max(0, gapStages.indexOf(n));
    const step = (to - from) / (gapStages.length + 1);
    const at = Math.round(from + step * (idx + 1));
    filled.set(n, { s: at, e: at, real: false });
  });

  /**
   * Anchor a derived programme to where the project actually is.
   *
   * `buildScheduleFromProject` starts its first design step *today*, because it
   * is written for a project about to begin. Run against a project already at
   * stage 2 it produces nonsense: stage 1 is marked complete yet dated this
   * month, stage 2 is the current stage yet dated next month, and a decision
   * genuinely raised last month falls off the left of the chart.
   *
   * Sliding the whole thing so today sits at the start of the current stage
   * puts finished stages behind us and unstarted ones ahead, which is the least
   * the client can be shown without lying. A schedule the studio actually saved
   * is never touched — those are real dates and not ours to move.
   */
  let shift = 0;
  if (!published) {
    const activeStage = lifecycle.stages.find(s => s.status === 'active');
    const w = activeStage ? filled.get(activeStage.stageNumber) : undefined;
    if (w) shift = todayDay - w.s;
  }
  if (shift !== 0) {
    filled.forEach((w, n) => filled.set(n, { ...w, s: w.s + shift, e: w.e + shift }));
    marks.forEach(list => list.forEach(m => { m.day += shift; m.dateISO = toISO(m.day); }));
  }

  const startDay = Math.min(...[...filled.values()].map(w => w.s));
  const endDay = Math.max(...[...filled.values()].map(w => w.e));

  return {
    dated: true,
    published,
    stages: lifecycle.stages.map(s => {
      const w = filled.get(s.stageNumber)!;
      return {
        stageNumber: s.stageNumber,
        name: s.shortName || s.name,
        startISO: toISO(w.s),
        endISO: toISO(w.e),
        startDay: w.s,
        endDay: w.e,
        month: monthOf(toISO(w.s)),
        hasSchedule: w.real,
        status: s.status,
        milestones: (marks.get(s.stageNumber) || [])
          .map(m => ({ ...m, date: dayOf(m.dateISO) }))
          .sort((a, b) => a.day - b.day),
      };
    }),
    startDay,
    endDay,
    todayDay,
    handoverLabel: schedule.targetHandoverISO
      ? monthOf(schedule.targetHandoverISO)
      : monthOf(toISO(endDay)),
  };
}
