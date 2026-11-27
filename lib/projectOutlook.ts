import type { ProjectSchedule } from '../types';
import type { ProjectPnl } from './projectPnl';
import { computeSchedule, GATE_LABEL, type ScheduleResult } from './schedule';

/*
  WHERE THE PROJECT IS HEADING (smart workspace, PR 5, ideas J and K; owner,
  27 Nov 2026: mainly for owners and project leads; nothing outside the app).

  The handover forecast: the date the programme engine (lib/schedule) now
  forecasts, against the target, the critical-path work that put it there,
  and the one change that would pull it back, worked out by running the same
  engine again without it, never guessed. When nothing on its own would, the
  engine's own catch-up figure says how much faster the rest has to run.

  The margin: the margin quoted against the one the project is on track for,
  from the same P&L the Reports screen draws (lib/projectPnl), and what moved
  it: envelopes over their budget, lines with no cost, and the cash the studio
  has committed to vendors beyond what the client has paid. For the roles that
  see the studio's money, behind the hide-figures eye.

  Pure, so the tests run it.
*/

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ (\d{2})$/, " ’$1");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ───────────── handover ───────────── */

export interface HandoverOutlook {
  forecastISO: string;
  targetISO: string | null;
  /** Working days past the target; 0 or less is on target. Null with no target. */
  lateWorkDays: number | null;
  /** The critical-path work that put the date where it is, worst first, at most three. */
  reasons: string[];
  /** The one change that would pull it back, with the date it would give; null when none is known. */
  lever: { text: string; forecastISO: string | null } | null;
}

/**
 * The handover forecast with its reasons and a lever. `schedule` is the saved
 * programme as the workspace reads it (lib/scheduleBuilder scheduleForEngagement);
 * `result` is computeSchedule of it, passed in so it is worked out once.
 */
export function handoverOutlook(schedule: ProjectSchedule, result: ScheduleResult, todayISO?: string): HandoverOutlook | null {
  if (!result?.finishISO) return null;
  const critical = new Set(result.criticalPath || []);
  const onPath = (result.tasks || []).filter((t) => critical.has(t.id) && t.status !== 'completed');

  const scored: Array<{ text: string; weight: number }> = [];
  for (const t of onPath) {
    const holdDays = t.heldBy.reduce((s, h) => s + h.workDays, 0);
    if (t.heldBy.length) scored.push({ text: `${t.title}: held ${plural(holdDays, 'working day')} (${t.heldBy.map((h) => h.reason).join(', ')})`, weight: 100 + holdDays });
    if (t.openGates.length) scored.push({ text: `${t.title}: waiting on ${t.openGates.map((g) => GATE_LABEL[g]).join(' and ')}`, weight: 90 });
    if (t.overrunning) scored.push({ text: `${t.title}: running past its planned end${t.driftDays ? `, ${plural(t.driftDays, 'working day')} over` : ''}`, weight: 50 + t.driftDays });
    else if (t.overdueToStart) scored.push({ text: `${t.title}: should have started on ${dayLabel(t.plannedStartISO)}`, weight: 40 + t.driftDays });
    else if (t.driftDays > 0) scored.push({ text: `${t.title}: ${plural(t.driftDays, 'working day')} behind`, weight: 30 + t.driftDays });
  }
  /*
    Holds, measured: each open hold is lifted in turn and the programme run
    again, so a hold's cost is the days it really moves handover (a hold that
    lands on a task's first day moves it without being listed on it).
  */
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const measured = (schedule.holds || []).filter((h) => !h.liftedAt).slice(0, 8).map((h) => {
    try {
      const again = computeSchedule({ ...schedule, holds: (schedule.holds || []).filter((x) => x.id !== h.id) }, todayISO);
      return { h, finishISO: again.finishISO, saves: again.finishISO ? days(again.finishISO, result.finishISO!) : 0 };
    } catch { return { h, finishISO: null, saves: 0 }; }
  }).filter((m) => m.saves > 0).sort((a, b) => b.saves - a.saves);
  measured.forEach((m) => scored.push({ text: `${m.h.reason}: a hold of ${plural(m.h.workDays, 'working day')} moves handover ${plural(m.saves, 'day')}`, weight: 200 + m.saves }));

  scored.sort((a, b) => b.weight - a.weight);
  const reasons = [...new Set(scored.map((s) => s.text))].slice(0, 3);

  /* The lever: the hold that costs most, lifted. */
  let lever: HandoverOutlook['lever'] = measured[0]?.finishISO
    ? { text: `Without the "${measured[0].h.reason}" hold, handover moves to ${dayLabel(measured[0].finishISO)}.`, forecastISO: measured[0].finishISO }
    : null;
  if (!lever && result.catchUp) {
    lever = { text: `To make the target, the remaining work has to run at ${Math.round(result.catchUp.factor * 100)}% of its planned time.`, forecastISO: null };
  }

  return {
    forecastISO: result.finishISO,
    targetISO: schedule.targetHandoverISO || null,
    lateWorkDays: schedule.targetHandoverISO ? result.overrunWorkDays : null,
    reasons,
    lever,
  };
}

/** One line for the list and the folded card: "Likely 9 Feb ’27 · 7 working days past target". */
export function handoverLine(o: HandoverOutlook): string {
  const late = o.lateWorkDays != null && o.lateWorkDays > 0;
  return `Likely ${dayLabel(o.forecastISO)}${late ? ` · ${plural(o.lateWorkDays!, 'working day')} past target` : o.targetISO ? ' · on target' : ''}`;
}

/* ───────────── margin ───────────── */

export interface MarginOutlook {
  quotedPct: number;
  /** What the project is on track for: actual costs where there are orders, the plan elsewhere. */
  currentPct: number;
  /** Quoted margin lost (positive) or gained (negative), in rupees. */
  movedBy: number;
  /** Share of the quoted margin lost, 0 to 1. */
  slipShare: number;
  overspent: Array<{ where: string; overBy: number }>;
  uncostedLines: number;
  /** Committed to vendors beyond what the client has paid, when it is. */
  exposure: number;
  confidence: ProjectPnl['confidence'];
  hasProcurement: boolean;
  tone: 'late' | 'turn' | 'plain';
}

export const CONFIDENCE_LINE: Record<ProjectPnl['confidence'], string> = {
  'plan-only': 'Nothing ordered yet: this is the plan, not what was spent.',
  'partly-committed': 'Part ordered: orders where there are any, the plan elsewhere.',
  'mostly-committed': 'Mostly ordered: close to what the job will cost.',
  'closed-out': 'Closed out: what the job cost.',
};

/** The margin card, from the project's P&L; null before there is anything sold to measure against. */
export function marginOutlook(pnl: ProjectPnl | null | undefined): MarginOutlook | null {
  if (!pnl || !(pnl.contractedTotal > 0)) return null;
  const movedBy = pnl.hasProcurement ? pnl.quotedMargin - pnl.currentMargin : 0;
  const slipShare = pnl.quotedMargin > 0 ? movedBy / pnl.quotedMargin : 0;
  return {
    quotedPct: Math.round(pnl.quotedMarginPct * 10) / 10,
    currentPct: Math.round((pnl.hasProcurement ? pnl.currentMarginPct : pnl.quotedMarginPct) * 10) / 10,
    movedBy,
    slipShare,
    overspent: (pnl.overspentEnvelopes || []).slice().sort((a, b) => b.overBy - a.overBy).slice(0, 3)
      .map((e) => ({ where: [e.roomId, e.category].filter(Boolean).join(' · '), overBy: e.overBy })),
    uncostedLines: pnl.uncostedLines || 0,
    exposure: Math.max(0, (pnl.committedCost || 0) - (pnl.receivedFromClient || 0)),
    confidence: pnl.confidence,
    hasProcurement: pnl.hasProcurement,
    tone: slipShare >= 0.25 ? 'late' : slipShare >= 0.1 || (pnl.overspentEnvelopes || []).length ? 'turn' : 'plain',
  };
}
