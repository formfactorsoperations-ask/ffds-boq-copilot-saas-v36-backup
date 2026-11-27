import { describe, it, expect } from 'vitest';
import { boqRevisionInsight, timeSpent } from '../../lib/boqRevisionInsight';

const rev = (id: string, number: number, status: string, updatedAt = number * 1000) =>
  ({ id, number, status, updatedAt, createdAt: 0 } as any);
const issue = (id: string, number: number, issuedAt: number, extra: any = {}) =>
  ({ id, kind: 'scope_revision', snapshot: { number }, issuedAt, ...extra } as any);

describe('boqRevisionInsight', () => {
  it('counts open scope revisions by who holds them, and leaves out applied and withdrawn ones', () => {
    const ctx: any = {
      scopeRevisions: [
        rev('a', 1, 'applied'),
        rev('b', 2, 'issued'),
        rev('c', 3, 'issued'),
        rev('d', 4, 'signed'),
        rev('e', 5, 'draft'),
        rev('f', 6, 'withdrawn'),
      ],
      documents: {
        issues: [
          issue('i2', 2, 100),
          issue('i3a', 3, 100, { changesRequested: { at: '2026-11-01', message: 'fewer lofts' } }),
        ],
      },
    };
    const r = boqRevisionInsight(ctx, [], null, 2);
    expect(r.applied).toBe(1);
    expect(r.open.map(o => [o.number, o.state])).toEqual([
      [2, 'with-client'], [3, 'sent-back'], [4, 'to-apply'], [5, 'drafting'],
    ]);
    expect(r.withClient).toBe(1);
    expect(r.withStudio).toBe(3);
    expect(r.queued).toBe(2);
    expect(r.toDo).toBe(6);
    expect(r.sentBackTimes).toBe(1);
  });

  it('calls a draft that the client once sent back a rework', () => {
    const ctx: any = {
      scopeRevisions: [rev('a', 1, 'draft')],
      documents: { issues: [issue('i1', 1, 100, { changesRequested: { at: '2026-11-01' } })] },
    };
    expect(boqRevisionInsight(ctx, [], null).open[0].state).toBe('reworking');
  });

  it('counts the versions of the chosen option made before signing', () => {
    const tiers: any[] = [
      { id: 'c1', name: 'Comfort', timestamp: 1 },
      { id: 'c2', name: 'Comfort v2', parentTierId: 'c1', timestamp: 2 },
      { id: 'c3', name: 'Comfort v3', parentTierId: 'c2', timestamp: 3 },
      { id: 'e1', name: 'Essential', timestamp: 1 },
    ];
    const r = boqRevisionInsight({ approvedTierId: 'c3' } as any, tiers, 'e1');
    expect(r.preSignRevisions).toBe(2);
    expect(r.optionName).toBe('Comfort');
    expect(boqRevisionInsight({} as any, tiers, 'e1').preSignRevisions).toBe(0);
  });

  it('groups the change ledger by reason, scope changes only', () => {
    const ctx: any = {
      boqRevisions: [
        { type: 'ADD', reasonCategory: 'Client Request' },
        { type: 'REVISE_QTY', reasonCategory: 'Client Request' },
        { type: 'REMOVE', reasonCategory: 'Value Engineering' },
        { type: 'REVISE_RATE' },
        { type: 'NOTE', reasonCategory: 'Client Request' },
      ],
    };
    const r = boqRevisionInsight(ctx, [], null);
    expect(r.ledger.total).toBe(4);
    expect(r.ledger.byReason).toEqual([
      { reason: 'Client Request', count: 2 },
      { reason: 'No reason given', count: 1 },
      { reason: 'Value Engineering', count: 1 },
    ]);
  });

  it('says nothing is to be done on a project with no revisions', () => {
    const r = boqRevisionInsight(undefined, undefined, undefined);
    expect(r.toDo).toBe(0);
    expect(r.open).toEqual([]);
    expect(r.ledger.total).toBe(0);
  });
});

describe('timeSpent', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const day = 86400000;
  it('counts meetings and site visits with their hours, as the Hub does', () => {
    const t = timeSpent([
      { type: 'client_meeting', durationMinutes: 60, date: now - 2 * day },
      { type: 'design_review', durationMinutes: 90, isVirtual: true, date: now - 40 * day },
      { type: 'client_meeting', date: new Date(now - 10 * day).toISOString() },
      { type: 'site_visit', durationMinutes: 45, date: { seconds: (now - 5 * day) / 1000 } },
      { type: 'client_meeting', durationMinutes: 300, status: 'cancelled', date: now - day },
    ], now);
    expect(t.meetings).toBe(3);
    expect(t.online).toBe(1);
    expect(t.inPerson).toBe(2);
    expect(t.meetingHours).toBe(2.5);
    expect(t.meetingsWithoutTime).toBe(1);
    expect(t.avgMeetingMinutes).toBe(75);
    expect(t.siteVisits).toBe(1);
    expect(t.siteHours).toBe(0.8);
    expect(t.totalHours).toBe(3.3);
    expect(t.last30).toBe(3);
    expect(t.lastAt).toBe(now - 2 * day);
  });

  it('is empty with nothing logged', () => {
    const t = timeSpent([], now);
    expect(t.meetings + t.siteVisits).toBe(0);
    expect(t.avgMeetingMinutes).toBeNull();
    expect(t.lastAt).toBeNull();
  });
});
