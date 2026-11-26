/*
  compileWeeklyReports reads a project's payment stages from the milestones
  Money saves on the project's context, and flags an invoice overdue on the
  same rule as Money's collections chase.
*/
import { describe, it, expect } from 'vitest';
import {
  hasInvoiceOverdue,
  overdueAfterDays,
  stageOverdue,
  weeklyHealthLabel,
  weeklyReportPaymentStages,
} from '../../functions/src/weeklyReport';

const NOW = new Date('2026-11-27T17:00:00+05:30').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const milestone = (over: any = {}) => ({
  id: 'd2', type: 'design', name: 'Design Development', percentage: 40, description: '',
  status: 'pending', ...over,
});

const project = (milestones: any[], ctx: any = {}) => ({
  status: 'active',
  context: { name: 'Sea View', paymentMilestones: milestones, ...ctx },
});

const report = (projectData: any, overdueDays = 7) =>
  weeklyHealthLabel({ projectData, designGate: null, drawings: [], overdueDays, now: NOW });

describe('weekly report: payment stages', () => {
  it('reads the milestones from the project context, keeping their shape', () => {
    const m = milestone({ status: 'invoiced', invoiceDate: daysAgo(3), invoiceNumber: 'INV-12' });
    const stages = weeklyReportPaymentStages(project([m]));
    expect(stages).toEqual([m]);
    expect(stages[0]).toMatchObject({ status: 'invoiced', invoiceDate: daysAgo(3), percentage: 40 });
  });

  it('is empty when the project has no milestones', () => {
    expect(weeklyReportPaymentStages({})).toEqual([]);
    expect(weeklyReportPaymentStages({ context: { paymentMilestones: 'x' } })).toEqual([]);
  });
});

describe('weekly report: invoice overdue', () => {
  it('flags an invoiced, unpaid milestone past the threshold as at risk', () => {
    const p = project([milestone({ status: 'invoiced', invoiceDate: daysAgo(10) })]);
    expect(hasInvoiceOverdue(p, 7, NOW)).toBe(true);
    expect(report(p)).toBe('at_risk');
  });

  it('counts an invoice exactly at the threshold, as Money does', () => {
    const p = project([milestone({ status: 'invoiced', invoiceDate: daysAgo(7) })]);
    expect(report(p)).toBe('at_risk');
  });

  it('does not flag an invoice inside the threshold', () => {
    const p = project([milestone({ status: 'invoiced', invoiceDate: daysAgo(3) })]);
    expect(report(p)).toBe('on_track');
  });

  it('does not flag a paid milestone, or one never invoiced', () => {
    expect(report(project([milestone({ status: 'paid', invoiceDate: daysAgo(40), paidDate: daysAgo(30) })]))).toBe('on_track');
    expect(report(project([milestone({ status: 'pending', date: daysAgo(40) })]))).toBe('on_track');
  });

  it('does not flag an invoice held in an open payment dispute', () => {
    const p = project(
      [milestone({ status: 'invoiced', invoiceDate: daysAgo(20) })],
      { disputes: [{ id: 'dsp1', status: 'open', openedOn: daysAgo(15), claimed: { design: 50000, execution: 0 } }] },
    );
    expect(report(p)).toBe('on_track');
  });

  it("uses the studio's own reminder threshold", () => {
    const p = project([milestone({ status: 'invoiced', invoiceDate: daysAgo(10) })]);
    const days = overdueAfterDays({ paymentMilestones: { escalation: { reminderDays: 14, warnDays: 21, pauseDays: 30 } } });
    expect(days).toBe(14);
    expect(report(p, days)).toBe('on_track');
    expect(overdueAfterDays(null)).toBe(7);
  });

  it('ignores an invoice with no date', () => {
    expect(stageOverdue({}, milestone({ status: 'invoiced' }), 7, NOW)).toBe(false);
  });
});
