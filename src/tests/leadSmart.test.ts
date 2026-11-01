import { describe, it, expect } from 'vitest';
import { dayKey } from '../../lib/opsDesk';
import { leadName, leadQueue, loseLead, reopenLead, leadStats, type Lead } from '../../lib/leads';
import {
  stageSince, stageAge, leadHeat, monthsToPossession, nextBestAction, templateText, furthestStage, leadInsights, calendarItems, monthGrid, shiftMonth, moveCalItem,
} from '../../lib/leadSmart';

const DAY = 86400000;
const NOW = new Date('2026-11-01T12:00:00+05:30').getTime();
const me = { email: 'anushka@s.in', name: 'Anushka' };
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', tenantId: 's', createdAt: NOW - 10 * DAY, createdBy: 'anushka@s.in', createdByName: 'Anushka', ownerEmail: 'anushka@s.in', ownerName: 'Anushka',
  people: [{ id: 'a', name: 'Mr Rohan Mehta', role: '', phone: '+91 98330 12345', email: '', main: true }],
  home: { where: 'Hiranandani, Powai', type: '3 BHK', area: 1150, scope: [], possession: '', budget: '' }, source: 'instagram', sourceNote: '', enquiry: '',
  stage: 'talking', lostReason: null, know: { decides: '', style: '', seenWork: false }, next: null, touches: [], firstTouchAt: NOW - 9 * DAY, lastTouchAt: NOW - DAY,
  openRequest: null, projectId: null, updatedAt: NOW, updatedBy: 'anushka@s.in', ...over,
});
const touch = (at: number, over: any = {}) => ({ id: String(at), at, by: 'x', byName: 'X', kind: 'stage', text: 'Moved to Meeting booked', reached: null, ...over });

describe('the name', () => {
  it('is what the studio called it, else worked out from the people', () => {
    expect(leadName(lead())).toBe('Mr Rohan Mehta');
    expect(leadName(lead({ label: '  Mehta family, Powai ' }))).toBe('Mehta family, Powai');
  });
});

describe('closing and reopening', () => {
  it('keeps the reason, the note, the day to try again and when, and clears the next step', () => {
    const l = loseLead(lead({ next: { text: 'Call', due: '2026-11-02', kind: 'call' } }), 'Postponed', '  Moving in 2027 ', '2027-01-10', me, NOW);
    expect(l).toMatchObject({ stage: 'lost', lostReason: 'Postponed', lostNote: 'Moving in 2027', revisitOn: '2027-01-10', closedAt: NOW, next: null });
    expect(l.touches.at(-1)!.text).toBe('Lost: Postponed (Moving in 2027). Try again 2027-01-10');
    expect(loseLead(lead(), 'Other', '', 'soon', me, NOW).revisitOn).toBeNull();
    expect(reopenLead(l, me, NOW + 1)).toMatchObject({ stage: 'talking', lostReason: null, lostNote: null, revisitOn: null, closedAt: null });
  });
  it('counts the month’s won and lost by when they closed', () => {
    const s = leadStats([lead({ stage: 'lost', closedAt: NOW, updatedAt: NOW - 40 * DAY }), lead({ stage: 'won', closedAt: NOW - 40 * DAY })], NOW);
    expect([s.lost.length, s.won]).toEqual([1, 0]);
  });
  it('brings a lost lead back on its owner’s Today list on the day to try again', () => {
    const l = lead({ stage: 'lost', lostReason: 'Postponed', lostNote: 'Moving in 2027', revisitOn: dayKey(NOW) });
    expect(leadQueue([l], 'anushka@s.in', false, NOW).map((q) => q.title)).toEqual(['Try again: Mr Rohan Mehta']);
    expect(leadQueue([{ ...l, revisitOn: dayKey(NOW + DAY) }], 'anushka@s.in', false, NOW)).toEqual([]);
    expect(leadQueue([l], 'priya@s.in', false, NOW)).toEqual([]);
  });
});

describe('days in stage', () => {
  it('counts from the last stage move, else from the first call', () => {
    expect(stageSince(lead())).toBe(NOW - 9 * DAY);
    expect(stageSince(lead({ touches: [touch(NOW - 3 * DAY), touch(NOW - 2 * DAY, { text: 'Asked Anish to open the project' })] as any }))).toBe(NOW - 3 * DAY);
    expect(stageAge(lead(), NOW)).toMatchObject({ days: 9, stuck: true });
    expect(stageAge(lead({ stage: 'new', createdAt: NOW - 3600000, firstTouchAt: null }), NOW)).toMatchObject({ days: 0, stuck: false, label: 'In stage since today' });
  });
});

describe('how warm it is', () => {
  it('reads possession in the client’s words', () => {
    expect(monthsToPossession('Jan 2027', NOW)).toBe(2);
    expect(monthsToPossession('ready now', NOW)).toBe(0);
    expect(monthsToPossession('2028', NOW)).toBe(19);
    expect(monthsToPossession('', NOW)).toBeNull();
  });
  it('rises with stage, referral, keys soon and conversations, and cools when quiet', () => {
    const hot = leadHeat(lead({
      stage: 'measured', source: 'referral', home: { ...lead().home, possession: 'Jan 2027', budget: '₹25 L' }, know: { decides: 'Both', style: '', seenWork: true },
      touches: [touch(NOW - DAY, { kind: 'call', reached: true, text: 'Brief' })] as any,
    }), NOW)!;
    expect(hot.heat).toBe('hot');
    expect(hot.reasons[0]).toMatch(/^\+ site measured/);
    const cold = leadHeat(lead({ lastTouchAt: NOW - 12 * DAY, touches: [touch(NOW - 20 * DAY, { kind: 'call', reached: false }), touch(NOW - 12 * DAY, { kind: 'call', reached: false })] as any }), NOW)!;
    expect(cold.heat).toBe('cold');
    expect(cold.reasons.join(' ')).toMatch(/quiet for 12 days/);
    expect(leadHeat(lead({ stage: 'won' }), NOW)).toBeNull();
  });
});

describe('the next best action', () => {
  it('follows the lead through its stages', () => {
    expect(nextBestAction(lead({ stage: 'new', firstTouchAt: null, createdAt: NOW - 30 * 60000 }), NOW)).toMatchObject({ action: 'call', title: 'Call now' });
    expect(nextBestAction(lead({ next: { text: 'Send samples', due: '2026-10-25', kind: 'call' } }), NOW)).toMatchObject({ action: 'next' });
    expect(nextBestAction(lead({ lastTouchAt: NOW - 6 * DAY }), NOW)).toMatchObject({ action: 'template', template: 'checkin' });
    expect(nextBestAction(lead(), NOW)).toMatchObject({ action: 'template', template: 'portfolio' });
    expect(nextBestAction(lead({ know: { decides: '', style: '', seenWork: true } }), NOW)).toMatchObject({ action: 'ask', ask: 'Who decides' });
    expect(nextBestAction(lead({ know: { decides: 'Both', style: '', seenWork: true }, home: { ...lead().home, possession: 'Jan', budget: '25 L' } }), NOW)).toMatchObject({ action: 'book' });
    expect(nextBestAction(lead({ stage: 'meeting' }), NOW)).toMatchObject({ action: 'measure' });
    expect(nextBestAction(lead({ stage: 'measured' }), NOW)).toMatchObject({ action: 'open' });
    expect(nextBestAction(lead({ stage: 'lost', revisitOn: dayKey(NOW) }), NOW)).toMatchObject({ template: 'revisit' });
    expect(nextBestAction(lead({ stage: 'lost' }), NOW)).toBeNull();
  });
  it('writes messages in the studio’s voice, to the first name', () => {
    const t = templateText('intro', lead(), { me: 'Anushka', studio: 'Form Factors' });
    expect(t).toMatch(/^Hi Rohan, this is Anushka from Form Factors\. Thank you for your enquiry about 3 BHK in Hiranandani\./);
    expect(templateText('meeting', lead({ next: { text: 'Studio meeting', due: '2026-11-04', kind: 'meeting', time: '16:00', meetUrl: 'https://meet.google.com/x' } }), { me: 'A', studio: 'S' }))
      .toMatch(/2026-11-04 at 16:00\. Here is the link: https:\/\/meet\.google\.com\/x/);
  });
});

describe('insights', () => {
  it('counts how far leads got, where they came from and why they were lost', () => {
    const leads = [
      lead({ id: 'a', stage: 'won', source: 'referral', closedAt: NOW - DAY, createdAt: NOW - 21 * DAY }),
      lead({ id: 'b', stage: 'lost', source: 'instagram', lostReason: 'Budget', touches: [touch(NOW - 5 * DAY)] as any }),
      lead({ id: 'c', stage: 'talking', source: 'instagram' }),
      lead({ id: 'd', createdAt: NOW - 400 * DAY }),
    ];
    expect(furthestStage(leads[1])).toBe(2);
    const i = leadInsights(leads, NOW - 90 * DAY);
    expect([i.total, i.won, i.lost, i.open, i.winRate, i.avgDaysToWin]).toEqual([3, 1, 1, 1, 50, 20]);
    expect(i.reached.map((r) => r.count)).toEqual([3, 3, 2, 1, 1]);
    expect(i.sources.map((s) => [s.label, s.total, s.winRate])).toEqual([['Instagram', 2, 0], ['Referral', 1, 100]]);
    expect(i.reasons).toEqual([{ reason: 'Budget', count: 1 }]);
  });
});

describe('the calendar', () => {
  it('puts next steps and days to try again on their day, and moves them', () => {
    const leads = [
      lead({ id: 'a', next: { text: 'Call back', due: '2026-10-30', kind: 'call' } }),
      lead({ id: 'b', next: { text: 'Studio meeting', due: '2026-11-04', kind: 'meeting', time: '16:00', calendarEventId: 'ev1' } }),
      lead({ id: 'c', stage: 'lost', revisitOn: '2026-11-20' }),
      lead({ id: 'd', stage: 'won', next: { text: 'x', due: '2026-11-05', kind: 'call' } }),
    ];
    const items = calendarItems(leads, NOW);
    expect(items.map((i) => [i.leadId, i.date, i.kind, i.overdue, i.movable])).toEqual([
      ['a', '2026-10-30', 'call', true, true], ['b', '2026-11-04', 'meeting', false, false], ['c', '2026-11-20', 'revisit', false, true],
    ]);
    expect(moveCalItem(leads[0], items[0], '2026-11-03').next!.due).toBe('2026-11-03');
    expect(moveCalItem(leads[2], items[2], '2026-12-01').revisitOn).toBe('2026-12-01');
  });
  it('lays a month out Monday first', () => {
    const g = monthGrid('2026-11');
    expect([g.length, g[0], g[6], g.includes('2026-11-30')]).toEqual([42, '2026-10-26', '2026-11-01', true]);
    expect([shiftMonth('2026-12', 1), shiftMonth('2026-01', -1)]).toEqual(['2027-01', '2025-12']);
  });
});
