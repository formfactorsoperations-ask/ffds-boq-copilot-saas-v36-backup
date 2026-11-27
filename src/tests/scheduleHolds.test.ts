/*
  Which holds cost a task days (lib/schedule computeSchedule heldBy), and so
  what the variance report, "days lost by reason" and "holds that cost
  nothing" say. A hold landing on a task's first day used to push the task
  without being recorded against it, because the check ran after the start had
  already been moved past the blocked days.
*/
import { describe, it, expect } from 'vitest';
import { buildScheduleFromProject } from '../../lib/scheduleBuilder';
import { computeSchedule, varianceReport, daysLostByReason, ineffectiveHolds, type ScheduleResult } from '../../lib/schedule';
import type { ProjectSchedule, ScheduleHold } from '../../types';

const TODAY = '2026-10-18';
const BOQ: any[] = [
  { cat: 'Site Preliminaries', qty: 1, materials: 100, labor: 100 },
  { cat: 'Civil & Demolition', qty: 1, materials: 300, labor: 100 },
  { cat: 'Electrical', qty: 1, materials: 300, labor: 100 },
  { cat: 'Carpentry', qty: 1, materials: 900, labor: 100 },
  { cat: 'Painting', qty: 1, materials: 200, labor: 100 },
];
const base = (): ProjectSchedule => ({
  ...buildScheduleFromProject({ targetHandoverDate: '2027-02-15' } as any, BOQ, {
    designSteps: [
      { stepNumber: 1, title: 'Concept', startDate: '2026-08-01', durationDays: 10 },
      { stepNumber: 2, title: 'Design development', startDate: '2026-08-15', durationDays: 10 },
    ],
  }),
  projectStartISO: '2026-08-01',
});
const hold = (id: string, fromISO: string, workDays: number, reason: string): ScheduleHold => ({ id, scope: 'site', fromISO, workDays, reason, at: 1 });
const withHolds = (holds: ScheduleHold[]): { s: ProjectSchedule; r: ScheduleResult } => {
  const s = { ...base(), holds };
  return { s, r: computeSchedule(s, TODAY) };
};
const firstExecution = () => computeSchedule(base(), TODAY).tasks.find((t) => t.kind === 'execution')!;

describe('holds against the tasks they delay', () => {
  it('records a hold that lands on a task’s first day, and counts it in the reports', () => {
    const t0 = firstExecution();
    const before = computeSchedule(base(), TODAY);
    const { s, r } = withHolds([hold('h1', t0.startISO, 10, 'Payment not received')]);
    expect(r.finishISO! > before.finishISO!).toBe(true);
    const t = r.tasks.find((x) => x.id === t0.id)!;
    expect(t.startISO > t0.startISO).toBe(true);
    expect(t.heldBy).toEqual([{ holdId: 'h1', reason: 'Payment not received', workDays: 10 }]);
    expect(varianceReport(r).rows).toContainEqual({ taskId: t0.id, title: t0.title, days: 10, cause: 'Payment not received' });
    expect(daysLostByReason(s.holds, r)).toEqual([{ reason: 'Payment not received', days: 10, scopes: ['whole site'], effective: true }]);
    expect(ineffectiveHolds(s.holds, r)).toEqual([]);
  });

  it('still records a hold that falls inside a task and stretches its end', () => {
    const t0 = firstExecution();
    const { r } = withHolds([hold('h2', t0.endISO, 3, 'Material delay')]);
    const t = r.tasks.find((x) => x.id === t0.id)!;
    expect(t.startISO).toBe(t0.startISO);
    expect(t.endISO > t0.endISO).toBe(true);
    expect(t.heldBy.map((h) => h.holdId)).toEqual(['h2']);
  });

  it('records only the holds that bit, not every hold on the task', () => {
    const t0 = firstExecution();
    const { s, r } = withHolds([hold('h1', t0.startISO, 5, 'Payment not received'), hold('far', '2030-01-07', 5, 'Festival')]);
    const t = r.tasks.find((x) => x.id === t0.id)!;
    expect(t.heldBy.map((h) => h.holdId)).toEqual(['h1']);
    expect(r.tasks.some((x) => x.heldBy.some((h) => h.holdId === 'far'))).toBe(false);
    expect(ineffectiveHolds(s.holds, r).map((h) => h.id)).toEqual(['far']);
  });

  it('says a hold that ended before the work began cost nothing', () => {
    const { s, r } = withHolds([hold('early', '2026-07-01', 5, 'Monsoon')]);
    expect(r.tasks.some((x) => x.heldBy.length)).toBe(false);
    expect(ineffectiveHolds(s.holds, r).map((h) => h.id)).toEqual(['early']);
  });
});
