import { describe, it, expect } from 'vitest';
import { dayKey, opsSettingsOf, type FollowUp, type QueueItem, type WaitingItem } from '../../lib/opsDesk';
import {
  inDeskScope, scopeCounts, matchesWork, playbookOf, explain, guideProgress, doneToday, dayRing, withSnoozes, liveSnoozes,
  teamRows, weekNumbers, logLine,
} from '../../lib/opsTeam';
import type { Lead } from '../../lib/leads';

const DAY = 86400000;
const NOW = new Date('2026-10-19T11:00:00+05:30').getTime();
const fu = (over: Partial<FollowUp>): FollowUp => ({
  id: Math.random().toString(36).slice(2), tenantId: 's', projectId: 'p1', projectName: 'Unique Vistas', at: NOW, by: 'anushka@s.in',
  byName: 'Anushka', channel: 'call', note: '', subject: null, outcome: 'info', next: null, nextDone: false, manual: true, ...over,
});

describe('actual and dummy projects', () => {
  const projects = [
    { context: { isDummy: false } }, { context: { projectCategory: 'actual' } }, { context: { isDummy: true } },
    { context: { projectCategory: 'dummy' } }, { context: {} },
  ];
  it('goes by the tag only', () => {
    expect(projects.filter((p) => inDeskScope(p, 'actual'))).toHaveLength(2);
    expect(projects.filter((p) => inDeskScope(p, 'dummy'))).toHaveLength(2);
    expect(projects.filter((p) => inDeskScope(p, 'untagged'))).toHaveLength(1);
    expect(projects.filter((p) => inDeskScope(p, 'all'))).toHaveLength(5);
    expect(scopeCounts(projects)).toEqual({ all: 5, actual: 2, dummy: 2, untagged: 1 });
  });
  it('lets the explicit isDummy flag win over the older category', () => {
    expect(inDeskScope({ context: { isDummy: false, projectCategory: 'dummy' } }, 'actual')).toBe(true);
  });
});

describe('the Today filter', () => {
  it('sorts each kind of work into calls, meetings or paperwork', () => {
    expect(matchesWork({ kind: 'payment' }, 'calls')).toBe(true);
    expect(matchesWork({ kind: 'visit' }, 'meetings')).toBe(true);
    expect(matchesWork({ kind: 'documents' }, 'paperwork')).toBe(true);
    expect(matchesWork({ kind: 'documents' }, 'calls')).toBe(false);
    expect(matchesWork({ kind: 'lead' }, 'all')).toBe(true);
  });
});

describe('playbooks', () => {
  it('uses the desk’s own unless a lead wrote one', () => {
    expect(playbookOf('decision', opsSettingsOf(null)).custom).toBe(false);
    const s = opsSettingsOf({ opsDesk: { playbooks: { decision: { steps: ['Call Mrs K', ''], dont: '' }, 'bad key': { steps: ['x'] } } } });
    expect(Object.keys(s.playbooks)).toEqual(['decision']);
    const p = playbookOf('decision', s);
    expect(p).toMatchObject({ custom: true, steps: ['Call Mrs K'] });
    expect(p.dont).toMatch(/Do not promise/);
  });
});

describe('a row that explains itself', () => {
  const settings = opsSettingsOf(null);
  const w: WaitingItem = { key: 'pay:m2', kind: 'payment', projectId: 'p1', projectName: 'Unique Vistas', label: 'Payment 2 (FF-14)', since: NOW - 9 * DAY, days: 9, dueKey: '2026-10-17', overdueDays: 2, reminders: 2, lastChaseAt: NOW - 4 * DAY };
  const q: QueueItem = { id: 'pay:p1:pay:m2', group: 'overdue', kind: 'payment', projectId: 'p1', projectName: 'Unique Vistas', title: 'Chase payment', detail: '', due: '2026-10-17', ref: 'pay:m2' };
  it('says why, what to do and what happens if it waits, with no amounts', () => {
    const e = explain(q, { waiting: w, settings, slipDays: 3 });
    expect(e.why).toMatch(/Payment 2 \(FF-14\) was invoiced 9 days ago/);
    expect(e.why).toMatch(/2 reminders so far/);
    expect(e.todo).toMatch(/Call the client today/);
    expect(e.ifWaits).toMatch(/about 3 days/);
    expect(JSON.stringify(e)).not.toMatch(/₹|\d{2},\d{3}/);
  });
});

describe('the first week', () => {
  it('counts ticked steps and the ones the desk can see for itself', () => {
    const g = guideProgress({ clients: NOW }, { logged: true, minutes: false, lead: false, escalated: false });
    expect([...g.done].sort()).toEqual(['clients', 'log']);
    expect(g.next?.id).toBe('today');
    expect(g.count).toBe(2);
  });
});

describe('the day', () => {
  const lines = [
    fu({ outcome: 'no_answer', subject: { kind: 'payment', key: 'pay:m2', label: 'Payment 2' } }),
    fu({ at: NOW - DAY }),
    fu({ by: 'tanvi@s.in', at: NOW - 3 * DAY, next: { text: 'Send the stone samples', ownerEmail: 'anushka@s.in', ownerName: 'Anushka', due: dayKey(NOW) }, nextDone: true, nextDoneAt: NOW - 3600000, nextDoneBy: 'anushka@s.in' } as any),
  ];
  it('lists what was closed today, by this person', () => {
    const d = doneToday(lines, 'Anushka@s.in', NOW);
    expect(d.map((x) => x.title)).toEqual(['Called about Payment 2, no answer', 'Send the stone samples']);
    expect(logLine({ channel: 'whatsapp', subject: null, outcome: 'reminded', note: 'Countertop' })).toBe('WhatsApp: Countertop, reminded');
  });
  it('fills the ring with done out of done plus still due', () => {
    const open = [{ group: 'overdue' }, { group: 'today' }, { group: 'week' }] as QueueItem[];
    expect(dayRing(open, [{} as any, {} as any])).toEqual({ done: 2, total: 4, ratio: 0.5 });
  });
  it('hides what was moved to a later day until it comes', () => {
    const q = [{ id: 'a' }, { id: 'b' }] as QueueItem[];
    const s = { a: dayKey(NOW + DAY), b: dayKey(NOW) };
    expect(withSnoozes(q, s, NOW)).toEqual({ shown: [{ id: 'b' }], hidden: 1 });
    expect(liveSnoozes(s, NOW)).toEqual({ a: dayKey(NOW + DAY) });
  });
});

describe('the lead’s view', () => {
  const lead = (over: Partial<Lead>): Lead => ({
    id: 'l1', tenantId: 's', createdAt: NOW - 30 * 60000, createdBy: 'priya@s.in', createdByName: 'Priya', ownerEmail: 'priya@s.in', ownerName: 'Priya',
    people: [{ id: 'a', name: 'Rohan Mehta', role: '', phone: '+91 98330 12345', email: '', main: true }],
    home: { where: 'Powai', type: '3 BHK', area: 1150, scope: [], possession: '', budget: '' }, source: 'instagram', sourceNote: '', enquiry: '',
    stage: 'new', lostReason: null, know: { decides: '', style: '', seenWork: false }, next: null, touches: [], firstTouchAt: null, lastTouchAt: null,
    openRequest: null, projectId: null, updatedAt: NOW, updatedBy: 'priya@s.in', ...over,
  });
  it('works out each person’s desk the way their own screen does', () => {
    const waiting: WaitingItem[] = [
      { key: 'pay:m2', kind: 'payment', projectId: 'p2', projectName: 'Harmony 704', label: 'Payment 2', since: NOW - 20 * DAY, days: 20, dueKey: '2026-10-08', overdueDays: 11, reminders: 0, lastChaseAt: null },
    ];
    const rows = teamRows({
      now: NOW,
      people: [{ email: 'anushka@s.in', name: 'Anushka', role: 'Client Relations', isNew: false }, { email: 'priya@s.in', name: 'Priya', role: 'Client Relations', isNew: true }],
      projectsOf: (e) => (e === 'priya@s.in' ? ['p2'] : ['p1']),
      followUps: [fu({})], waiting, moms: [], escalations: [], leads: [lead({})],
    });
    expect(rows[0]).toMatchObject({ clients: 1, done: 1, overdue: 0, tone: 'ok', leadsNew: 0 });
    expect(rows[1]).toMatchObject({ clients: 1, done: 0, overdue: 1, leadsNew: 1, tone: 'warn', lastLogAt: null });
    expect(rows[1].overdueKinds).toEqual(['payment']);
    expect(rows[1].total).toBe(2);
  });
  it('adds up the week', () => {
    const n = weekNumbers([fu({}), fu({ channel: 'whatsapp', subject: { kind: 'payment', key: 'pay:m2', label: 'x' } }), fu({ at: NOW - 9 * DAY })],
      [lead({ firstTouchAt: NOW })], [], NOW);
    expect(n).toMatchObject({ logged: 2, calls: 1, paymentsChased: 1, avgFirstCallMin: 30, decided: 0 });
  });
});
