import { describe, it, expect } from 'vitest';
import type { WaitingItem } from '../../lib/opsDesk';
import type { VisitRequest } from '../../lib/clientCare';
import {
  healthOf, phaseOf, progressOf, daysUntil, matchesClient, payState, payAgeing, byLateness, todayTimeline, runwayOf,
  streakOf, weekStrip, clockLabel, inLabel, countWord, PHASES,
} from '../../lib/opsDesk2';

/* Tuesday 11 November 2026, 2:20 PM in India. */
const NOW = new Date('2026-11-11T14:20:00+05:30').getTime();

const pay = (over: Partial<WaitingItem>): WaitingItem => ({
  key: `pay:${Math.random().toString(36).slice(2)}`, kind: 'payment', projectId: 'p1', projectName: 'Unique Vistas', label: 'Payment 2',
  since: NOW, days: 0, reminders: 0, lastChaseAt: null, ...over,
});
const visit = (over: Partial<VisitRequest>): VisitRequest => ({
  id: Math.random().toString(36).slice(2), tenantId: 's', projectId: 'p1', projectName: 'Sea Breeze', kind: 'site_visit', mode: 'in_person',
  purpose: 'Painting check', requestedBy: 'studio', status: 'confirmed', slot: { date: '2026-11-11', time: '09:30' }, reschedules: 0, history: [],
  createdAt: NOW, createdBy: 'a@s.in', createdByName: 'A', updatedAt: NOW, updatedBy: 'a@s.in', ...over,
});

describe('every stored status has a place on the new screens', () => {
  it('reads the pulse band as a health tone', () => {
    expect(healthOf('good')).toBe('good');
    expect(healthOf('watch')).toBe('warn');
    expect(healthOf('at_risk')).toBe('bad');
    expect(healthOf(undefined)).toBe('good');
  });

  it('puts each project status on the proposal-to-handover strip', () => {
    const at = (status: string, extra: any = {}) => phaseOf({ status, ...extra }, { now: NOW });
    expect(at('lead').name).toBe('Proposal');
    expect(at('draft').name).toBe('Proposal');
    expect(at('proposal_sent').line).toBe('Proposal sent');
    expect(at('negotiation').name).toBe('Proposal');
    expect(at('won').name).toBe('Design');
    expect(at('won', { designApprovedAt: 1 }).name).toBe('Approvals');
    expect(at('execution', { targetHandoverDate: '2027-02-01' }).name).toBe('Execution');
    expect(at('execution', { targetHandoverDate: '2026-11-20' }).name).toBe('Handover');
    expect(at('work_paused').line).toBe('Execution · paused');
    expect(at('completed')).toMatchObject({ name: 'Handover', complete: true });
    /* A status the desk has never seen is never dropped. */
    expect(at('something_new').index).toBe(0);
    expect(at('').index).toBe(0);
    expect(phaseOf({ status: 'execution' }, { now: NOW, handoverStarted: true }).name).toBe('Handover');
    expect(PHASES).toHaveLength(5);
  });

  it('takes progress from the journey, else from the step', () => {
    expect(progressOf({ journeySummary: { pct: 81.4 } }, phaseOf({ status: 'execution' }, { now: NOW }))).toBe(81);
    expect(progressOf({ status: 'completed' }, phaseOf({ status: 'completed' }))).toBe(100);
    expect(progressOf({ status: 'won' }, phaseOf({ status: 'won' }))).toBe(22);
  });

  it('counts days to a date in India', () => {
    expect(daysUntil('2026-11-14', NOW)).toBe(3);
    expect(daysUntil('2026-11-11', NOW)).toBe(0);
    expect(daysUntil('2026-11-01', NOW)).toBe(-10);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('not a date', NOW)).toBeNull();
  });

  it('filters the wall', () => {
    const c = (health: any, status: string, progress: number) => ({ health, phase: phaseOf({ status }, { now: NOW }), progress });
    expect(matchesClient(c('warn', 'execution', 40), 'attention')).toBe(true);
    expect(matchesClient(c('good', 'execution', 40), 'attention')).toBe(false);
    expect(matchesClient(c('good', 'execution', 70), 'handover')).toBe(true);
    expect(matchesClient(c('good', 'completed', 100), 'handover')).toBe(false);
    expect(matchesClient(c('good', 'won', 20), 'design')).toBe(true);
    expect(matchesClient(c('good', 'execution', 20), 'site')).toBe(true);
    expect(matchesClient(c('good', 'won', 20), 'all')).toBe(true);
  });
});

describe('payments', () => {
  it('says how late, or how long to go', () => {
    expect(payState(pay({ overdueDays: 9 }), NOW)).toEqual({ state: 'late', days: 9 });
    expect(payState(pay({ dueKey: '2026-11-13' }), NOW)).toEqual({ state: 'due', days: 2 });
    expect(payState(pay({}), NOW)).toEqual({ state: 'due', days: 0 });
  });

  it('sorts into the three ageing columns, decisions left out', () => {
    const a = payAgeing([pay({}), pay({ overdueDays: 3 }), pay({ overdueDays: 7 }), pay({ overdueDays: 8 }), { ...pay({}), kind: 'decision' }]);
    expect([a.due.length, a.late1to7.length, a.late8.length]).toEqual([1, 2, 1]);
  });

  it('puts the latest first, then the soonest due', () => {
    const list = [pay({ label: 'soon', dueKey: '2026-11-12' }), pay({ label: 'late 2', overdueDays: 2 }), pay({ label: 'later', dueKey: '2026-11-20' }), pay({ label: 'late 9', overdueDays: 9 })];
    expect(list.sort(byLateness(NOW)).map((w) => w.label)).toEqual(['late 9', 'late 2', 'soon', 'later']);
  });
});

describe('today, on one line', () => {
  it('orders today’s meetings and finds the next one', () => {
    const t = todayTimeline([
      visit({ slot: { date: '2026-11-11', time: '16:30' } }),
      visit({ slot: { date: '2026-11-11', time: '09:30' } }),
      visit({ slot: { date: '2026-11-12', time: '10:00' } }),
      visit({ slot: { date: '2026-11-11', time: '15:00' }, status: 'cancelled' }),
      visit({ slot: { date: '2026-11-11', time: '14:00' } }),
    ], NOW);
    expect(t.rows.map((r) => r.visit.slot!.time)).toEqual(['09:30', '14:00', '16:30']);
    expect(t.rows.map((r) => r.past)).toEqual([true, false, false]);
    expect(t.nextIn).toBe(130);
    expect(t.nowAt).toBe(14 * 60 + 20);
  });

  it('says nothing is left when the day is done', () => {
    expect(todayTimeline([visit({})], NOW).nextIn).toBeNull();
  });

  it('writes times the way people read them', () => {
    expect(clockLabel(14 * 60 + 20)).toBe('2:20');
    expect(clockLabel(9 * 60)).toBe('9:00');
    expect(inLabel(25)).toBe('25 min');
    expect(inLabel(130)).toBe('2 h 10 min');
    expect(inLabel(120)).toBe('2 h');
    expect(countWord(2)).toBe('Two');
    expect(countWord(12)).toBe('12');
  });
});

describe('the approval runway', () => {
  it('counts working days since the email, with the reminders', () => {
    const sent = new Date('2026-11-06T10:00:00+05:30').getTime(); // Friday
    const r = runwayOf('sent', { sentAt: sent, reminders: [1] }, NOW);
    expect(r).toMatchObject({ overdue: false, reminders: 1, of: 2 });
    expect(r!.day).toBeGreaterThanOrEqual(3);
    expect(r!.left).toBe(Math.max(0, 5 - r!.day));
  });

  it('has no runway for drawings not with the client', () => {
    expect(runwayOf('presented', null, NOW)).toBeNull();
    expect(runwayOf('approved', { sentAt: NOW }, NOW)).toBeNull();
    expect(runwayOf('sent', { sentAt: null }, NOW)).toBeNull();
  });
});

describe('the streak', () => {
  it('counts working days closed in a row, a Sunday never breaking it', () => {
    /* 11 Nov is a Wednesday; 9 Nov a Monday, 8 Nov a Sunday. */
    expect(streakOf(['2026-11-10', '2026-11-09', '2026-11-07'], NOW)).toBe(3);
    expect(streakOf(['2026-11-11', '2026-11-10'], NOW)).toBe(2);
    expect(streakOf(['2026-11-09'], NOW)).toBe(0);
    expect(streakOf([], NOW)).toBe(0);
  });

  it('shows this week, Monday to Saturday', () => {
    const w = weekStrip(['2026-11-09'], NOW);
    expect(w.map((d) => d.letter).join('')).toBe('MTWTFS');
    expect(w[0]).toMatchObject({ key: '2026-11-09', done: true, today: false });
    expect(w[2]).toMatchObject({ key: '2026-11-11', today: true });
    expect(w[3].future).toBe(true);
  });
});
